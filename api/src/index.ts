import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import express from 'express';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from './config/cors.config';
import { AppModule } from './modules/app.module';

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
  app.use(express.json());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new RequestLoggingInterceptor()
  );
  app.setGlobalPrefix(API_PREFIX);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
