import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

// This automatically inherits all validation from CreateEventDto, 
// but makes every field optional so you can update just one thing at a time!
export class UpdateEventDto extends PartialType(CreateEventDto) {}