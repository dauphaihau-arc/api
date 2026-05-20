import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import express from 'express';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from './config/cors.config';
import { AppModule } from './modules/app.module';
import { RequestContextService } from './modules/shared/request-context/request-context.service';

const API_PREFIX = 'v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsAllowedOrigins = parseCorsAllowedOrigins(process.env);

  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }

  if (corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: corsAllowedOrigins,
      credentials: true,
    });
  }
  app.enableShutdownHooks();
  app.use(express.json({
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );
  app.useGlobalFilters(
    new GlobalExceptionFilter(app.get(RequestContextService))
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new RequestLoggingInterceptor(app.get(RequestContextService))
  );
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      {
        path: 'health',
        method: RequestMethod.GET,
      },
    ],
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
