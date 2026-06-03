import { PrismaClient } from '@prisma/client';

import { Injectable, OnModuleInit, OnModuleDestroy} from '@nestjs/common';


@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Optional: Log database queries to the console during development
    super({
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
