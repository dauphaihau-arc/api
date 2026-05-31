import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { Queue } from 'bullmq';
import express from 'express';
import { Logger, PinoLogger } from 'nestjs-pino';
import { setupApiDocs } from './common/docs/setup-api-docs';
import { setupBullBoard } from './common/docs/setup-bull-board';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { captureException, initializeSentry } from './common/sentry/sentry';
import { parseCorsAllowedOrigins } from './config/cors.config';
import { AppModule } from './modules/app.module';
import { ObservabilityService } from './modules/shared/observability/observability.service';
import { BULLMQ_QUEUE } from './modules/shared/queue/infra/queue.constants';
import { RequestContextService } from './modules/shared/request-context/request-context.service';

const API_PREFIX = 'v1';

async function bootstrap() {
  initializeSentry('api');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const bootstrapLogger = await app.resolve(PinoLogger);
  const exceptionLogger = await app.resolve(PinoLogger);
  const requestLogger = await app.resolve(PinoLogger);
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
    new GlobalExceptionFilter(
      app.get(RequestContextService),
      exceptionLogger
    )
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new RequestLoggingInterceptor(
      app.get(RequestContextService),
      app.get(ObservabilityService),
      requestLogger
    )
  );
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      {
        path: 'health',
        method: RequestMethod.GET,
      },
      {
        path: 'health/ready',
        method: RequestMethod.GET,
      },
      {
        path: 'metrics',
        method: RequestMethod.GET,
      },
    ],
  });
  setupApiDocs(app);
  setupBullBoard(
    app,
    app.get<Queue | null>(BULLMQ_QUEUE, { strict: false })
  );

  bootstrapLogger.info({
    context: 'Bootstrap',
    event: 'bootstrap.http.listen.start',
    port: Number(process.env.PORT ?? 3000),
  }, 'Starting HTTP listener');

  await app.listen(process.env.PORT ?? 3000);

  bootstrapLogger.info({
    context: 'Bootstrap',
    event: 'bootstrap.http.listen.ready',
    port: Number(process.env.PORT ?? 3000),
  }, 'HTTP listener ready');
}

void bootstrap().catch((error) => {
  captureException(error, (scope) => {
    scope.setTag('runtime', 'api');
    scope.setContext('bootstrap', {
      entrypoint: 'src/index.ts',
    });
  });

  throw error;
});
