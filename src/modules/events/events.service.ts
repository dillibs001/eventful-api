import { Injectable, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service'; 
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto'; // <-- Added this import!
import { MailService } from '../mail/mail.service';
import { TicketsService } from '../tickets/tickets.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface CreatorAnalytics {
  totalTicketsSold: number;
  totalAttendees: number;
  totalRevenue: number;
}

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('email-queue') private emailQueue: Queue,
    
    // Inject TicketsService using forwardRef to prevent circular dependency crashes
    @Inject(forwardRef(() => TicketsService))
    private ticketsService: TicketsService
  ) {}
  
  // ==========================================
  // 1. EVENT METHODS (CRUD)
  // ==========================================
  
  async createEvent(creatorId: string, createEventDto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        title: createEventDto.title,
        description: createEventDto.description,
        // Prisma requires a Javascript Date object, so we convert your ISO string here:
        date: new Date(createEventDto.date), 
        location: createEventDto.location,
        capacity: createEventDto.capacity,
        price: createEventDto.price || 0, // Defaults to 0 if it was left blank (free event)
       creator: {
          connect: {
            id: creatorId
          }
        }
      },
    });
  }

  async getEventById(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async findAll() {
    return this.prisma.event.findMany(); 
  }

  async updateEvent(id: string, updateEventDto: UpdateEventDto) {
    // 1. Verify the event exists first
    const existingEvent = await this.prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      throw new NotFoundException('Event not found');
    }

    // 2. Update it in the database
    return this.prisma.event.update({
      where: { id },
      data: updateEventDto,
    });
  }

  async deleteEvent(id: string) {
    // 1. Verify the event exists first
    const existingEvent = await this.prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      throw new NotFoundException('Event not found');
    }

    // 2. Delete it from the database
    return this.prisma.event.delete({
      where: { id },
    });
  }

  // ==========================================
  // 2. REGISTRATION & TICKETING
  // ==========================================

  async registerForEvent(eventId: string, userId: string, userEmail: string) {
    // A. Check if the event actually exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // B. Save the ticket to the database
    const ticket = await this.prisma.ticket.create({
      data: {
        eventId: eventId,
        userId: userId,
      }
    });

    // C. Ask TicketsService to generate the QR code Base64 string
    const qrCodeDataUrl = await this.ticketsService.generateTicketQrCode(ticket.id);

    // D. Tell BullMQ to send the immediate confirmation email, passing the QR code!
    await this.mailService.sendTicketConfirmation(
      userEmail, 
      event.title, 
      ticket.id,
      qrCodeDataUrl
    );

    // E. Schedule the 24-hour reminder email
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    const timeUntilEvent = event.date.getTime() - Date.now();
    const delay = timeUntilEvent - twentyFourHoursInMs;

    if (delay > 0) {
      await this.emailQueue.add(
        'event-reminder',
        { email: userEmail, eventTitle: event.title },
        { delay } // Redis holds this job until the delay expires
      );
      console.log(`📅 Reminder scheduled for ${userEmail} in ${Math.round(delay / 60000)} minutes.`);
    }

    return {
      message: `Successfully registered for ${event.title}`,
      ticketId: ticket.id
    };
  }

  // ==========================================
  // 3. ANALYTICS METHOD
  // ==========================================

  async getCreatorDashboard(creatorId: string): Promise<{ source: string; data: CreatorAnalytics }> {
    const cacheKey = `creator:analytics:${creatorId}`;

    // Explicitly type the expected return from the cache
    const cachedAnalytics = await this.cacheManager.get<CreatorAnalytics | string>(cacheKey);

    if (cachedAnalytics) {
      // Safely handle the case where Redis returns a raw string instead of a parsed object
      const parsedData: CreatorAnalytics = typeof cachedAnalytics === 'string' 
        ? JSON.parse(cachedAnalytics) 
        : cachedAnalytics;

      return { 
        source: 'cache', 
        data: parsedData 
      };
    }

    // Cache Miss - Run the PostgreSQL queries
    const [ticketStats, revenueStats] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: { event: { creatorId } },
        _count: { 
          id: true, 
          isScanned: true 
        },
      }),
      this.prisma.transaction.aggregate({
        where: { event: { creatorId }, status: 'SUCCESS' },
        _sum: { 
          amount: true 
        },
      }),
    ]);

    // Explicitly declare the type of the result before returning or caching
    const analyticsResult: CreatorAnalytics = {
      totalTicketsSold: ticketStats._count.id,
      totalAttendees: ticketStats._count.isScanned,
      totalRevenue: revenueStats._sum.amount || 0,
    };

    // Save to Redis Cache for 10 minutes (600,000 ms)
    await this.cacheManager.set(cacheKey, analyticsResult, 600000);

    return { 
      source: 'database', 
      data: analyticsResult 
    };
  }
}