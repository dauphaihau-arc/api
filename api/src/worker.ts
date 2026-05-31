import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import { captureException, initializeSentry } from './common/sentry/sentry';
import { QueueWorkerModule } from './modules/shared/queue/queue-worker.module';
import { validateAppEnv } from './config/app-env.config';

async function bootstrap() {
  initializeSentry('worker');
  validateAppEnv(process.env);
  const app = await NestFactory.createApplicationContext(QueueWorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const bootstrapLogger = await app.resolve(PinoLogger);

  app.enableShutdownHooks();
  bootstrapLogger.info({
    context: 'Bootstrap',
    event: 'bootstrap.worker.ready',
  }, 'Worker application context ready');
}

void bootstrap().catch((error) => {
  captureException(error, (scope) => {
    scope.setTag('runtime', 'worker');
    scope.setContext('bootstrap', {
      entrypoint: 'src/worker.ts',
    });
  });

  throw error;
});
