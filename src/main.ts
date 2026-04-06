import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() {
      return this.toString();
    },
    configurable: true,
  });

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.APP_PORT ?? 3000);
}

void bootstrap();
