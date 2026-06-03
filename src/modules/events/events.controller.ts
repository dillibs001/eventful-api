import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request,Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Events')
@Controller('events')


export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @ApiBearerAuth() //
  @ApiOperation({ summary: 'Create a new event (Creators Only)' })
  @ApiResponse({ status: 201, description: 'Event created successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Requires CREATOR role.' })



  // Only users with the CREATOR role can create events
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CREATOR)
  @Post()
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register to attend an event (Eventees Only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EVENTEE)
  @Post(':id/attend')
  attendEvent(@Param('id') id: string) {
    return {
      message: `Successfully registered attendance for event ${id}`,
    };
  }

  @ApiOperation({ summary: 'View all public events' })
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.eventsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
  //   return this.eventsService.update(+id, updateEventDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.eventsService.remove(+id);
  // }
}
