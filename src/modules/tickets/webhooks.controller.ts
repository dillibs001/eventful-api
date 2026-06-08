import { Controller, Post, Req, Res, Headers, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { TicketsService } from './tickets.service';


@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly ticketsService: TicketsService) {}

  // POST http://localhost:3000/webhooks/paystack
  @Post('paystack')
  async handlePaystackWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-paystack-signature') signature: string, // Paystack's secret stamp
  ) {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // 1. Cryptographic Security Check
    // We hash the incoming data using our secret key. 
    // If our hash doesn't perfectly match Paystack's stamp, someone is spoofing the payment.
    const hash = crypto
      .createHmac('sha512', secret as string)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      // It's a fake request. Reject it with a 401 Unauthorized.
      return res.status(HttpStatus.UNAUTHORIZED).send('Invalid signature');
    }

    // 2. Process the verified event
    const event = req.body;

    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      
      // 3. Hand the reference to our fulfillment engine to print the ticket!
      await this.ticketsService.fulfillTicket(reference);
    }

    // 4. Crucial: Paystack requires a 200 OK immediately, 
    // otherwise it thinks your server is down and will retry sending the webhook for 72 hours.
    return res.status(HttpStatus.OK).send();
  }
}