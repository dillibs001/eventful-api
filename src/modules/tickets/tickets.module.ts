import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; 
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from '../../prisma/prisma.service'; 
import { PaystackService } from '../paystack/paystack.service'; 
import { EventsModule } from '../events/events.module';

@Module({
  imports: [HttpModule,forwardRef(() => EventsModule),], // unlock Axios inside this module
  controllers: [TicketsController,WebhooksController],
  providers: [TicketsService, PrismaService, PaystackService], 
  exports: [TicketsService]
})
export class TicketsModule {}