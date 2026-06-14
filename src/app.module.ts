import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config'; // ConfigService
import { CacheModule } from '@nestjs/cache-manager';          // Cache
import { BullModule } from '@nestjs/bullmq';                  // BullMQ
import { redisStore } from 'cache-manager-redis-yet';         // Redis Store

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { MailModule } from './modules/mail/mail.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';


@Module({
  imports: [
    // 1. Initialize global config FIRST
    ConfigModule.forRoot({ 
      isGlobal: true, 
    }), 

    // 2. Global Caching Configuration (Upstash Redis)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          socket: {
            host: configService.get<string>('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT'),
            // tls: true, // Required for Upstash secure connection
          },
          password: configService.get<string>('REDIS_PASSWORD'),
        }),
      }),
    }),

    // 3. Global Background Queues Configuration (Upstash Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        //   tls: {rejectUnauthorized: false}, // Required for Upstash secure connection
        // },
        // family: 4,
        },
      }),
    }),

    // 4. Application Modules
    PrismaModule, 
    UsersModule, 
    AuthModule, 
    EventsModule, 
    TicketsModule, 
    MailModule,

    // 5. Global Rate Limiting Configuration (Upstash Redis)
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'short', ttl: 60000, limit: 10 }],
      storage: new ThrottlerStorageRedisService({
        host: process.env.REDIS_HOST, // Your Redis URL
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 6. Apply rate limiting globally to every route
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}