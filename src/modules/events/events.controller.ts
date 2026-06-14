import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, Delete } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string; // <-- Changed from 'sub' to 'userId'
    email: string;
    role: Role;
  };
}

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly ticketsService: TicketsService,
  ) {}

  @ApiBearerAuth() //
  @ApiOperation({ summary: 'Create a new event (Creators Only)' })
  @ApiResponse({ status: 201, description: 'Event created successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires CREATOR role.' })
  // Only users with the CREATOR role can create events
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Post()
  create(@Body() createEventDto: CreateEventDto, @Req() req: AuthenticatedRequest) {
    // 2. TypeScript knows 'sub' exists because of your JwtPayload type!
    const creatorId = req.user.userId;

    if (!creatorId) {
      throw new Error("Backend Error: 'sub' is missing at runtime. We need to check your JwtStrategy!");
    }

    // 3. Send the guaranteed string ID to Prisma
    return this.eventsService.createEvent(creatorId, createEventDto);
  }

  //redis endpoint
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get creator dashboard analytics (totals across all of your events)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Get('analytics/dashboard')
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.eventsService.getCreatorDashboard(req.user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'View all events you have created, with ticket counts (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Get('mine')
  getMyEvents(@Req() req: AuthenticatedRequest) {
    return this.eventsService.findByCreator(req.user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register to attend an event (Eventees Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EVENTEE)
  @Post(':id/attend')
  attendEvent(@Param('id') eventId: string, @Req() req: AuthenticatedRequest) {
    // We grab the user's ID and Email straight from your secure JWT!
    const userId = req.user.userId;
    const userEmail = req.user.email;

    // Routed through the same purchase flow as /tickets/purchase so that
    // paid events correctly go through Paystack instead of issuing a free ticket.
    return this.ticketsService.purchaseTicket(eventId, userId, userEmail);
  }

  @ApiOperation({ summary: 'View all public events' })
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }

  // ==========================================
  // GET SINGLE EVENT
  // ==========================================
  @ApiOperation({ summary: 'View details of a specific event' })
  @Get(':id')
  getEvent(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }

  @ApiOperation({ summary: 'Get shareable links for an event (social media, etc.)' })
  @Get(':id/share')
  getShareLinks(@Param('id') id: string) {
    return this.eventsService.getShareLinks(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'View attendees who applied/registered for an event (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Get(':id/attendees')
  getAttendees(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.eventsService.getEventAttendees(id, req.user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get analytics for a specific event (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Get(':id/analytics')
  getEventAnalytics(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.eventsService.getEventAnalytics(id, req.user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'View payment/transaction details for an event (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Get(':id/transactions')
  getEventTransactions(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.eventsService.getEventTransactions(id, req.user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a custom reminder for an event (Eventees Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EVENTEE)
  @Post(':id/reminders')
  setReminder(@Param('id') id: string, @Body() dto: CreateReminderDto, @Req() req: AuthenticatedRequest) {
    return this.eventsService.setReminder(req.user.userId, id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'View your custom reminders for an event (Eventees Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EVENTEE)
  @Get(':id/reminders')
  getMyReminders(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.eventsService.getMyReminders(req.user.userId, id);
  }

  // UPDATE: Edit an existing event

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an event (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
    // Note: Make sure 'updateEvent' matches the exact method name in your events.service.ts
    return this.eventsService.updateEvent(id, updateEventDto);
  }

  // DELETE: Remove an event entirely

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an event (Creators Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.eventsService.deleteEvent(id);
  }
}
