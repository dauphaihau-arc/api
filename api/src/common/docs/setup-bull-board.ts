import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';

function requireBasicAuth(
  username: string,
  password: string
): (request: Request, response: Response, next: NextFunction) => void {
  const expectedToken = Buffer.from(`${username}:${password}`).toString('base64');

  return (request, response, next) => {
    const header = request.headers.authorization;

    if (header === `Basic ${expectedToken}`) {
      next();
      return;
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    response.status(401).send('Authentication required');
  };
}

export function setupBullBoard(
  app: INestApplication,
  queue: Queue | null
): void {
  const isEnabled = (process.env.BULL_BOARD_ENABLED ?? 'true') === 'true';

  if (!isEnabled || !queue) {
    return;
  }

  const boardPath = process.env.BULL_BOARD_PATH ?? '/ops/queues';
  const username = process.env.BULL_BOARD_USERNAME?.trim();
  const password = process.env.BULL_BOARD_PASSWORD?.trim();
  const serverAdapter = new ExpressAdapter();
  const httpAdapter = app.getHttpAdapter().getInstance();

  serverAdapter.setBasePath(boardPath);
  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  if (username && password) {
    httpAdapter.use(boardPath, requireBasicAuth(username, password));
  }

  httpAdapter.use(boardPath, serverAdapter.getRouter());
}
