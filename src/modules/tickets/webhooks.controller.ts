import { Controller, Post, Req, Res, Headers, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiTags, ApiExcludeController } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';

interface PaystackRequest {
  rawBody: Buffer;
  body: Record<string, unknown>;
}

interface PaystackResponse {
  status: (code: number) => PaystackResponse;
  send: (body?: string) => void;
}

@ApiTags('Webhooks')
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('paystack')
  async handlePaystackWebhook(
    @Req() req: PaystackRequest,
    @Res() res: PaystackResponse,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto
      .createHmac('sha512', secret as string)
      .update(req.rawBody)
      .digest('hex');

    if (hash !== signature) {
      return res.status(HttpStatus.UNAUTHORIZED).send('Invalid signature');
    }

    const event = req.body;

    if (event['event'] === 'charge.success') {
      const data = event['data'] as { reference: string };
      await this.ticketsService.fulfillTicket(data.reference);
    }

    return res.status(HttpStatus.OK).send();
  }
}
