import { Controller, Post, Req, Res, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaystackService } from './paystack.service';
import { PaystackWebhookBody } from './interfaces/paystack-webhook.interface';

@Controller('paystack')
export class PaystackController {
  constructor(private readonly paystackService: PaystackService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK) // ⚠️ CRITICAL: Paystack requires an immediate 200 OK
  handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    // 1. Send the 200 OK response to Paystack instantly so they don't timeout
    res.send();

    // 2. Process the cryptography and database logic asynchronously
    const body = req.body as PaystackWebhookBody;
    
    this.paystackService.processWebhook(signature, body).catch((err) => {
      // We log this internally because we already responded 200 to Paystack
      console.error('Webhook processing failed:', err.message);
    });
  }
}