import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Tech Conference 2026', description: 'The name of the event' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'A massive gathering of backend engineers.', description: 'Event details' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: '2026-10-15T09:00:00Z', description: 'When the event happens' })
  @IsDateString()
  date!: string;
}