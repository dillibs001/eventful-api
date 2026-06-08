import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaystackService } from './paystack.service';
import { PaystackController } from '../paystack/paystack.controller';

import { EventsModule } from '../events/events.module'; 

@Module({
  imports: [
    HttpModule,
    
    forwardRef(() => EventsModule) 
  ],
  controllers: [PaystackController],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}