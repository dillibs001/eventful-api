import { Controller, Get, Res} from '@nestjs/common';
import type {Response} from "express"
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
redirectToEvents(@Res() res: Response) {
    // This tells the browser: "The home page is actually at /events"
    return res.redirect('/events');
  }
  
}
