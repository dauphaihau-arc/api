import { NestFactory } from '@nestjs/core';
import { QueueWorkerModule } from './modules/shared/queue/queue-worker.module';
import { validateAppEnv } from './config/app-env.config';

async function bootstrap() {
  validateAppEnv(process.env);
  const app = await NestFactory.createApplicationContext(QueueWorkerModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableShutdownHooks();
}

void bootstrap();
