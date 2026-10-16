import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './config/env';

async function bootstrap() {
  const config = env(); // falla rápido si la configuración es inválida
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  await app.listen(config.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API escuchando en :${config.PORT} (${config.NODE_ENV})`);
}

void bootstrap();
