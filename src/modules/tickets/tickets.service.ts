import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException,
  ConflictException 
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service'; 
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid'; 
import { PaystackService } from '../paystack/paystack.service';


@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService, 
    private paystackService: PaystackService
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
    return this.prisma.$transaction(async (tx) => {
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
        const qrCode = await this.generateTicketQrCode(ticket.id);

        return { message: 'Free ticket claimed successfully!', ticket, qrCode };
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

        // Ask Paystack for the checkout link
        const authorizationUrl = await this.paystackService.initializePayment(
          userEmail,
          event.price, 
          transactionReference,
          eventId,
          userId
        );

        return {
          message: 'Payment required. Redirecting to checkout...',
          authorization_url: authorizationUrl,
          reference: transactionReference, // Return this so the frontend can track it
        };
      }
    });
  }

 
  // 4. FULFILLMENT (The Webhook Catcher) 

  async fulfillTicket(reference: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Find the pending transaction in the ledger
      const transaction = await tx.transaction.findUnique({
        where: { reference },
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

      // 4. Generate the QR Code
      const qrCode = await this.generateTicketQrCode(ticket.id);

      // Log it for your own server monitoring
      console.log(`✅ PAYMENT SUCCESSFUL: Ticket generated for Event ${transaction.eventId}`);
      
      return ticket;
    });
  }
}