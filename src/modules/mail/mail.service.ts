import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';


@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    @InjectQueue('email-queue') private readonly emailQueue: Queue 
  ) {}

  // 1. Accept the qrCodeDataUrl as the 4th argument
  async sendTicketEmail(toEmail: string, eventName: string, ticketId: string, qrCodeDataUrl: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Your Ticket for ${eventName} 🎉`,
        template: './ticket-confirmation',
        context: {
          eventName,
          ticketId,
        },
        attachments: [
          {
            filename: 'ticket-qrcode.png',
            path: qrCodeDataUrl, // 👈 Directly attach the string coming from the queue
            cid: 'qrcode',
          },
        ],
      });
      console.log(`✉️ Ticket confirmation email dispatched to ${toEmail}`);
    } catch (error) {
      console.error('Mailer Error (Ticket Confirmation):', error);
      throw new InternalServerErrorException('Failed to queue or send ticket email');
    }
  }

  // 2. Add qrCodeDataUrl to the payload being sent to the Queue
  async sendTicketConfirmation(email: string, eventName: string, ticketId: string, qrCodeDataUrl: string): Promise<{ message: string }> {
    const payload = { email, eventName, ticketId, qrCodeDataUrl };
    
    // Push the email data + the Base64 string to Redis
    await this.emailQueue.add('ticket-confirmation', payload);
    
    return { message: 'Email job added to queue' };
  }

  async sendReminderEmail(toEmail: string, eventTitle: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Reminder: ${eventTitle} is happening tomorrow! ⏳`,
        template: './event-reminder',
        context: {
          eventName: eventTitle,
        },
      });
      console.log(`✉️ Event reminder email dispatched to ${toEmail}`);
    } catch (error) {
      console.error('Mailer Error (Event Reminder):', error);
    }
  }
}