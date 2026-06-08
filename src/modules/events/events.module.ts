import { Module, forwardRef } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TicketsModule } from '../tickets/tickets.module'; // 👈 Import this

@Module({
  imports: [
    forwardRef(() => TicketsModule)
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService]
})
export class EventsModule {}