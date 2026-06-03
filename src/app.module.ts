import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, EventsModule,ConfigModule.forRoot({ 
      isGlobal: true, 
    }),],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
