import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { join } from 'node:path';
import { json, urlencoded } from 'express';
import express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() {
      return this.toString();
    },
    configurable: true,
  });

  const app = await NestFactory.create(AppModule);
app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://boisterous-sfogliatella-3e55f2.netlify.app',
    ],
    credentials: true,
  });
  
  app.use(json({ limit: '200kb' }));
  app.use(urlencoded({ extended: true, limit: '200kb' }));
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  await app.listen(process.env.APP_PORT ?? 3000);
}

void bootstrap();
