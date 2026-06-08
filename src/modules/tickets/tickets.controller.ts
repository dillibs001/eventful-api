import { Controller, Post, Param, Req, UseGuards, Body } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth, 
  ApiParam, 
  ApiBody 
} from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@ApiTags('Tickets') // Groups these routes under "Tickets" in Swagger UI
@ApiBearerAuth()    // Requires JWT for all routes in this controller
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('verify/:ticket_id')
  @Roles(Role.CREATOR)
  @ApiOperation({ summary: 'Verify ticket validity (Creators Only)' })
  @ApiParam({ name: 'ticket_id', description: 'The unique ID of the ticket' })
  @ApiResponse({ status: 200, description: 'Ticket verified! Entry granted.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Only the event creator can verify.' })
  @ApiResponse({ status: 404, description: 'Ticket not found.' })
  @ApiResponse({ status: 400, description: 'Ticket already scanned.' })
  verifyTicket(
    @Param('ticket_id') ticketId: string, 
    @Req() req: AuthenticatedRequest
  ) {
    const scannerUserId = req.user.userId; 
    return this.ticketsService.verifyTicket(ticketId, scannerUserId);
  }

  @Post('purchase')
  @Roles(Role.EVENTEE)
  @ApiOperation({ summary: 'Purchase a ticket for an event (Eventees Only)' })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: 'Purchase successful or redirect URL generated.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  @ApiResponse({ status: 400, description: 'Event sold out.' })
  @ApiResponse({ status: 409, description: 'Ticket already purchased by user.' })
  async purchaseTicket(
    @Body() createTicketDto: CreateTicketDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const attendeeId = req.user.userId; 
    const attendeeEmail = req.user.email;
    return this.ticketsService.purchaseTicket(createTicketDto.eventId, attendeeId, attendeeEmail);
  }
}