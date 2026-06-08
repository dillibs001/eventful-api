import * as crypto from 'crypto';
import { 
  Injectable, 
  InternalServerErrorException, 
  ForbiddenException, 
  Inject, 
  forwardRef 
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
// 1. ⚠️ We import EventsService here!
import { EventsService } from '../events/events.service';
import { PaystackWebhookBody } from './interfaces/paystack-webhook.interface';

@Injectable()
export class PaystackService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    // 2. ⚠️ We inject EventsService here!
    @Inject(forwardRef(() => EventsService)) 
    private readonly eventsService: EventsService
  ) {}
  
  async initializePayment(
    email: string, 
    amount: number, 
    reference: string, 
    eventId: string, 
    userId: string
  ): Promise<string> {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    const url = 'https://api.paystack.co/transaction/initialize';
    
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(url,
          {
            email,
            amount:amount * 100, // Paystack expects amount in kobo (cents)
            reference,
            metadata: {
              eventId,
              userId,
              email
            }
          },
          {
            headers: {
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/json',
            },
          }
        ).pipe(
          catchError((error) => {
            throw new InternalServerErrorException('Failed to connect to the payment gateway');
          })
        )
      );

      if (!data.status) {
        throw new InternalServerErrorException(data.message || 'Paystack initialization failed');
      }

      return data.data.authorization_url; 

    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('An unexpected error occurred during checkout');
    }
  }

  async processWebhook(signature: string, body: PaystackWebhookBody): Promise<void> {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    
    if (!secretKey) {
      throw new InternalServerErrorException('Paystack secret key is not configured.');
    }

    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    if (body.event === 'charge.success') {
      const { eventId, userId, email } = body.data.metadata;

      // 3. ⚠️ We call registerForEvent on eventsService!
      await this.eventsService.registerForEvent(eventId, userId, email);
      
      console.log(`✅ PAYMENT SUCCESSFUL: Ticket generated for Event ${eventId}`);
    }
  }
}