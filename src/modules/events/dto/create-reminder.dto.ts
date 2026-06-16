import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({
    description: 'How many minutes before the event starts to send this reminder, e.g. 60 for "1 hour before"',
    example: 60,
  })
  @IsInt()
  @Min(1)
  offsetMinutes!: number;
}
