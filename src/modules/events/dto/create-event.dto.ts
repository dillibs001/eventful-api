import { 
  IsNotEmpty, 
  IsString, 
  IsInt, 
  Min, 
  IsNumber, 
  IsOptional, 
  MaxLength, 
  IsDateString 
} from 'class-validator';

export class CreateEventDto {
  @IsNotEmpty({ message: 'Event title is required' })
  @IsString()
  @MaxLength(100, { message: 'Title cannot exceed 100 characters' })
  title!: string;

  @IsNotEmpty({ message: 'Event description is required' })
  @IsString()
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description!: string;

  // Enforces a strict timestamp format so your frontend and backend timezones don't clash
  @IsNotEmpty({ message: 'Event date is required' })
  @IsDateString({}, { message: 'Date must be a valid ISO 8601 string (e.g., 2026-12-01T18:00:00Z)' })
  date!: string;

  @IsNotEmpty({ message: 'Location is required' })
  @IsString()
  location!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Price cannot be negative' })
  price?: number; 
}