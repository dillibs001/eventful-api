import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';

import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';

@Global() 
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT),
          secure: true, 
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        defaults: {
          from: process.env.SMTP_FROM,
        },
        template: {
          dir: join(__dirname, 'templates'), 
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'email-queue', 
    }),
  ],
  providers: [MailService, MailProcessor],
  // Export BullModule so EventsService can access the queue
  exports: [MailService, BullModule], 
})
export class MailModule {}