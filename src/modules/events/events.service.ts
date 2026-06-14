import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface CreatorAnalytics {
  totalTicketsSold: number;
  totalAttendees: number;
  totalRevenue: number;
}

const ALL_EVENTS_CACHE_KEY = 'events:all';
const EVENT_CACHE_KEY = (id: string) => `event:${id}`;
const EVENT_ANALYTICS_CACHE_KEY = (id: string) => `event:analytics:${id}`;
const EVENTS_LIST_TTL = 60_000; // 1 minute
const EVENT_DETAIL_TTL = 60_000; // 1 minute
const EVENT_ANALYTICS_TTL = 600_000; // 10 minutes

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('email-queue') private emailQueue: Queue,
  ) {}

  // ==========================================
  // 1. EVENT METHODS (CRUD)
  // ==========================================

  async createEvent(creatorId: string, createEventDto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        title: createEventDto.title,
        description: createEventDto.description,
        // Prisma requires a Javascript Date object, so we convert your ISO string here:
        date: new Date(createEventDto.date),
        location: createEventDto.location,
        capacity: createEventDto.capacity,
        price: createEventDto.price || 0, // Defaults to 0 if it was left blank (free event)
        reminderOffsets: createEventDto.reminderOffsets || [],
        creator: {
          connect: {
            id: creatorId,
          },
        },
      },
    });

    await this.cacheManager.del(ALL_EVENTS_CACHE_KEY);

    return event;
  }

  async getEventById(eventId: string) {
    const cacheKey = EVENT_CACHE_KEY(eventId);
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.cacheManager.set(cacheKey, event, EVENT_DETAIL_TTL);
    return event;
  }

  async findAll() {
    const cached = await this.cacheManager.get(ALL_EVENTS_CACHE_KEY);
    if (cached) return cached;

    const events = await this.prisma.event.findMany();

    await this.cacheManager.set(ALL_EVENTS_CACHE_KEY, events, EVENTS_LIST_TTL);
    return events;
  }

  // "My events" - events a creator has created, with how many tickets have been sold for each
  async findByCreator(creatorId: string) {
    return this.prisma.event.findMany({
      where: { creatorId },
      include: { _count: { select: { tickets: true } } },
      orderBy: { date: 'asc' },
    });
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
    const data: Prisma.EventUpdateInput = { ...updateEventDto };
    if (updateEventDto.date) {
      data.date = new Date(updateEventDto.date);
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data,
    });

    await this.invalidateEventCaches(id);

    return updatedEvent;
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
    const deletedEvent = await this.prisma.event.delete({
      where: { id },
    });

    await this.invalidateEventCaches(id);

    return deletedEvent;
  }

  private async invalidateEventCaches(eventId: string) {
    await Promise.all([
      this.cacheManager.del(ALL_EVENTS_CACHE_KEY),
      this.cacheManager.del(EVENT_CACHE_KEY(eventId)),
      this.cacheManager.del(EVENT_ANALYTICS_CACHE_KEY(eventId)),
    ]);
  }

  // ==========================================
  // 2. ATTENDEES (Creator view of who applied)
  // ==========================================

  async getEventAttendees(eventId: string, creatorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== creatorId) {
      throw new ForbiddenException('You are not authorized to view attendees for this event');
    }

    return this.prisma.ticket.findMany({
      where: { eventId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ==========================================
  // 3. SHAREABILITY
  // ==========================================

  async getShareLinks(eventId: string) {
    const event = await this.getEventById(eventId);
    const { title, description, id } = event as { id: string; title: string; description: string };

    const baseUrl = process.env.FRONTEND_URL || 'https://eventful-frontend-mu.vercel.app';
    const eventUrl = `${baseUrl}/events/${id}`;
    const shareText = `${title} - ${description}`.slice(0, 200);

    return {
      url: eventUrl,
      platforms: {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(eventUrl)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${eventUrl}`)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(eventUrl)}`,
        email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${shareText} ${eventUrl}`)}`,
      },
    };
  }

  // ==========================================
  // 4. REMINDERS (Eventee-configured)
  // ==========================================

  async setReminder(userId: string, eventId: string, dto: CreateReminderDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const reminder = await this.prisma.reminder
      .create({
        data: {
          userId,
          eventId,
          offsetMinutes: dto.offsetMinutes,
        },
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('You already have a reminder set for this offset on this event');
        }
        throw error;
      });

    // If the eventee already has a ticket for this event, schedule the reminder immediately.
    const ticket = await this.prisma.ticket.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });

    if (ticket) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const delay = event.date.getTime() - dto.offsetMinutes * 60 * 1000 - Date.now();

      if (delay > 0 && user) {
        await this.emailQueue.add('event-reminder', { email: user.email, eventTitle: event.title }, { delay });
      }
    }

    return reminder;
  }

  async getMyReminders(userId: string, eventId: string) {
    return this.prisma.reminder.findMany({
      where: { userId, eventId },
      orderBy: { offsetMinutes: 'asc' },
    });
  }

  // ==========================================
  // 5. ANALYTICS
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
        data: parsedData,
      };
    }

    // Cache Miss - Run the PostgreSQL queries
    const [ticketStats, revenueStats] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: { event: { creatorId } },
        _count: {
          id: true,
          isScanned: true,
        },
      }),
      this.prisma.transaction.aggregate({
        where: { event: { creatorId }, status: 'SUCCESS' },
        _sum: {
          amount: true,
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
      data: analyticsResult,
    };
  }

  // Per-event analytics: tickets sold, attendees scanned and revenue for one specific event
  async getEventAnalytics(eventId: string, creatorId: string): Promise<{ source: string; data: CreatorAnalytics }> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== creatorId) {
      throw new ForbiddenException('You are not authorized to view analytics for this event');
    }

    const cacheKey = EVENT_ANALYTICS_CACHE_KEY(eventId);
    const cached = await this.cacheManager.get<CreatorAnalytics>(cacheKey);

    if (cached) {
      return { source: 'cache', data: cached };
    }

    const [ticketStats, revenueStats] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: { eventId },
        _count: {
          id: true,
          isScanned: true,
        },
      }),
      this.prisma.transaction.aggregate({
        where: { eventId, status: 'SUCCESS' },
        _sum: {
          amount: true,
        },
      }),
    ]);

    const analyticsResult: CreatorAnalytics = {
      totalTicketsSold: ticketStats._count.id,
      totalAttendees: ticketStats._count.isScanned,
      totalRevenue: revenueStats._sum.amount || 0,
    };

    await this.cacheManager.set(cacheKey, analyticsResult, EVENT_ANALYTICS_TTL);

    return { source: 'database', data: analyticsResult };
  }

  // ==========================================
  // 6. PAYMENTS (Creator view of transactions for their events)
  // ==========================================

  async getEventTransactions(eventId: string, creatorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== creatorId) {
      throw new ForbiddenException('You are not authorized to view payments for this event');
    }

    return this.prisma.transaction.findMany({
      where: { eventId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
