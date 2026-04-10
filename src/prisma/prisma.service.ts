import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    const databaseUrl =
      configService.get<string>('DATABASE_URL') ??
      configService.get<string>('DATABASE_URL_LOCAL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL or DATABASE_URL_LOCAL is required');
    }

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
