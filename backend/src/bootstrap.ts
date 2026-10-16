import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { allowedOrigins, env } from './config/env';

/** Configuración HTTP compartida por main.ts y las pruebas de integración. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  if (env().TRUST_PROXY) express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  express.useBodyParser('json', { limit: '100kb' });
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Sin cabecera Origin (curl, health checks, mismo origen vía proxy) se permite.
      if (!origin || allowedOrigins().includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
  app.enableShutdownHooks();
  return app;
}
