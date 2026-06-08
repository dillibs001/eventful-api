import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTicketDto {

    @ApiProperty({ 
    description: 'The UUID of the event you wish to attend', 
    example: '550e8400-e29b-41d4-a716-446655440000' 
  })
    @IsNotEmpty({ message: 'Event ID is required' })
  eventId!: string;
}