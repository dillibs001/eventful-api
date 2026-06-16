import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';

const PAYSTACK_API_URL = 'https://api.paystack.co/transaction/initialize';

@Injectable()
export class PaystackService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}


  async initializePayment(
    email: string, 
    amount: number, 
    reference: string, 
    eventId: string, 
    userId: string
  ): Promise<string> {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(PAYSTACK_API_URL,
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
          catchError(() => {
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
}