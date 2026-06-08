import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from './mail.service';

export interface TicketConfirmationPayload {
  email: string;
  eventName: string;
  ticketId: string;
  qrCodeDataUrl: string; //  expect the string from Redis
}

export interface ReminderJobPayload {
  email: string;
  eventTitle: string;
}


export interface TicketConfirmationPayload {
  email: string;
  eventName: string;
  ticketId: string;
}

@Processor('email-queue')
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }
  
  async process(job: Job<unknown, void, string>): Promise<void> {
    switch (job.name) {
      case 'ticket-confirmation': {
        const data = job.data as TicketConfirmationPayload;
        console.log(`\n📨 [BACKGROUND WORKER] Sending Ticket to ${data.email}...`);
        
        // Pass the QR string to the mail service
        await this.mailService.sendTicketEmail(
          data.email, 
          data.eventName, 
          data.ticketId, 
          data.qrCodeDataUrl
        );
        
        console.log(`✅ [BACKGROUND WORKER] Ticket sent to ${data.email}!\n`);
        break;
      }

      case 'event-reminder': {
        const data = job.data as ReminderJobPayload;
        console.log(`\n⏳ [BACKGROUND WORKER] Sending Reminder to ${data.email}...`);
        
        await this.mailService.sendReminderEmail(data.email, data.eventTitle);
        
        console.log(`✅ [BACKGROUND WORKER] Reminder sent to ${data.email}!\n`);
        break;
      }

      default:
        console.log(`⚠️ [BACKGROUND WORKER] Unknown job name: ${job.name}`);
    }
  }
}