import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { PaystackService } from '../paystack/paystack.service';
import { MailService } from '../mail/mail.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

interface ReminderEventInfo {
  id: string;
  title: string;
  date: Date;
  reminderOffsets: number[];
}

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private mailService: MailService,
    @InjectQueue('email-queue') private emailQueue: Queue,
  ) {}

  // 1. GENERATION

  async generateTicketQrCode(ticketId: string) {
    const url = `https://api.eventful.com/tickets/verify/${ticketId}`;
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(url);
      return qrCodeDataUrl;
    } catch (error) {
      throw new Error('Failed to generate QR Code');
    }
  }

  // Sends the confirmation email (with QR code) and schedules every reminder
  // (creator-configured + the eventee's own custom reminders) for this ticket.
  private async finalizeTicket(
    ticket: { id: string },
    event: ReminderEventInfo,
    userId: string,
    userEmail: string,
  ) {
    const qrCodeDataUrl = await this.generateTicketQrCode(ticket.id);

    await this.mailService.sendTicketConfirmation(userEmail, event.title, ticket.id, qrCodeDataUrl);

    await this.scheduleReminders(event, userId, userEmail);

    return qrCodeDataUrl;
  }

  // Combines the creator-configured reminder offsets with the eventee's own
  // custom reminders, dedupes them, and schedules a delayed email job for each.
  private async scheduleReminders(event: ReminderEventInfo, userId: string, userEmail: string) {
    const customReminders = await this.prisma.reminder.findMany({
      where: { userId, eventId: event.id },
    });

    const offsets = new Set<number>([...event.reminderOffsets, ...customReminders.map((r) => r.offsetMinutes)]);

    for (const offsetMinutes of offsets) {
      const delay = event.date.getTime() - offsetMinutes * 60 * 1000 - Date.now();

      if (delay > 0) {
        await this.emailQueue.add('event-reminder', { email: userEmail, eventTitle: event.title }, { delay });
      }
    }
  }

  // 2. VERIFICATION

  async verifyTicket(ticketId: string, scannerUserId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: true },
    });

    if (!ticket) {
      throw new NotFoundException('Invalid ticket ID');
    }

    if (ticket.event.creatorId !== scannerUserId) {
      throw new ForbiddenException('You are not authorized to scan tickets for this event');
    }

    if (ticket.isScanned) {
      throw new BadRequestException('TICKET ALREADY SCANNED. Deny entry.');
    }

    const scannedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { isScanned: true },
    });

    return {
      message: 'Ticket verified! Entry granted.',
      ticket: scannedTicket,
    };
  }

  // 3. PURCHASING (The Cash Register)

  async purchaseTicket(eventId: string, userId: string, userEmail: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        include: { _count: { select: { tickets: true } } },
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      if (event._count.tickets >= event.capacity) {
        throw new BadRequestException('Sorry, this event is completely sold out!');
      }

      const existingTicket = await tx.ticket.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });

      if (existingTicket) {
        throw new ConflictException('You have already purchased a ticket for this event.');
      }

      if (event.price === 0) {
        // FREE FLOW: Create ticket instantly
        const ticket = await tx.ticket.create({
          data: { userId, eventId },
        });

        return { free: true as const, ticket, event };
      } else {
        // PAID FLOW: Send to Paystack
        const transactionReference = `TKT-${uuidv4()}`;

        // THE MISSING STEP: Save the intent to pay in the ledger BEFORE calling Paystack
        await tx.transaction.create({
          data: {
            reference: transactionReference,
            amount: event.price,
            userId: userId,
            eventId: eventId,
            status: 'PENDING',
          },
        });

        return { free: false as const, transactionReference, event };
      }
    });

    if (result.free) {
      const qrCode = await this.finalizeTicket(result.ticket, result.event, userId, userEmail);

      return { message: 'Free ticket claimed successfully!', ticket: result.ticket, qrCode };
    }

    // Ask Paystack for the checkout link (outside the DB transaction)
    const authorizationUrl = await this.paystackService.initializePayment(
      userEmail,
      result.event.price,
      result.transactionReference,
      eventId,
      userId,
    );

    return {
      message: 'Payment required. Redirecting to checkout...',
      authorization_url: authorizationUrl,
      reference: result.transactionReference, // Return this so the frontend can track it
    };
  }

  // 4. FULFILLMENT (The Webhook Catcher)

  async fulfillTicket(reference: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Find the pending transaction in the ledger
      const transaction = await tx.transaction.findUnique({
        where: { reference },
        include: { event: true, user: true },
      });

      // If it doesn't exist, or we already processed it, ignore it to prevent duplicate tickets
      if (!transaction || transaction.status === 'SUCCESS') {
        return;
      }

      // 2. The money is secured. Update the ledger to SUCCESS.
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: 'SUCCESS' },
      });

      // 3. Create the actual Ticket for the event
      const ticket = await tx.ticket.create({
        data: {
          userId: transaction.userId,
          eventId: transaction.eventId,
        },
      });

      return { ticket, event: transaction.event, user: transaction.user };
    });

    if (!result) {
      return;
    }

    // 4. Generate the QR Code, send the confirmation email & schedule reminders
    const qrCode = await this.finalizeTicket(result.ticket, result.event, result.user.id, result.user.email);

    // Log it for your own server monitoring
    console.log(`✅ PAYMENT SUCCESSFUL: Ticket generated for Event ${result.event.id}`);

    return { ...result.ticket, qrCode };
  }

  // 5. "MY TICKETS" (Eventee view of events they're attending)

  async getMyTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
