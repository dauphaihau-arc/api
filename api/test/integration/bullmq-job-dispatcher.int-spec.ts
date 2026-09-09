import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AppJobName, AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import type { QueueConfig } from '~/platform/config/queue.config';
import { BullMqJobDispatcher } from '~/integrations/queue/infra/bullmq-job-dispatcher';

const redisUrl = process.env.QUEUE_REDIS_URL ??
  process.env.REDIS_URL ??
  'redis://127.0.0.1:6379';

const waitFor = async (
  assertion: () => void | Promise<void>,
  timeoutMilliseconds = 5_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    }
    catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out');
};

const waitForPromise = async <T>(
  promise: Promise<T>,
  timeoutMilliseconds = 5_000,
  message = 'Timed out waiting for promise',
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(message)),
      timeoutMilliseconds,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  }
  finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const waitForCompleted = async (
  queue: Queue,
  jobId: string,
): Promise<void> => {
  await waitFor(async () => {
    const job = await queue.getJob(jobId);
    expect(await job?.getState()).toBe('completed');
  });
};

const newQueueConfig = (queueName: string, prefix: string): QueueConfig => ({
  driver: 'redis',
  queueName,
  prefix,
  redisUrl,
  defaultAttempts: 1,
  defaultBackoffMilliseconds: 1,
  removeCompletedAfterSeconds: 86_400,
  removeFailedAfterSeconds: 86_400,
  workerConcurrency: 1,
});

const newRedis = (): Redis => new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

describe('BullMqJobDispatcher integration', () => {
  beforeAll(async () => {
    const connection = newRedis();

    try {
      await connection.ping();
    }
    catch (error) {
      throw new Error(
        `Redis is required for ${__filename}; failed to ping ${redisUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    finally {
      await connection.quit().catch(() => connection.disconnect());
    }
  });

  it('runs a coalesce-latest dispatch even when a completed legacy job id is retained', async () => {
    const prefix = `arc-test-${Date.now()}-legacy`;
    const queueName = 'bullmq-job-dispatcher';
    const deduplicationKey = 'user-send-welcome-email--user-1';
    const processedUserIds: string[] = [];
    const connection = newRedis();
    const workerConnection = newRedis();
    const queue = new Queue<
      AppJobPayloadMap[AppJobName],
      unknown,
      AppJobName
    >(queueName, {
      connection,
      prefix,
    });
    const worker = new Worker<
      AppJobPayloadMap[AppJobName],
      unknown,
      AppJobName
    >(queueName, async (job) => {
      processedUserIds.push(
        (job.data as AppJobPayloadMap['user.send-welcome-email']).userId,
      );
    }, {
      connection: workerConnection,
      prefix,
    });
    const dispatcher = new BullMqJobDispatcher(
      newQueueConfig(queueName, prefix),
      connection,
    );

    try {
      await worker.waitUntilReady();

      await queue.add(
        appJobName.sendWelcomeEmail,
        { userId: 'legacy', email: 'member@example.com' },
        {
          jobId: deduplicationKey,
          removeOnComplete: { age: 86_400 },
        },
      );

      await waitForCompleted(queue, deduplicationKey);
      expect(processedUserIds).toEqual(['legacy']);

      await dispatcher.dispatch(
        appJobName.sendWelcomeEmail,
        { userId: 'fresh', email: 'member@example.com' },
        {
          deduplicationKey,
          deduplicationMode: 'coalesce-latest',
        },
      );

      await waitFor(() => {
        expect(processedUserIds).toEqual(['legacy', 'fresh']);
      });
    }
    finally {
      await dispatcher.onApplicationShutdown();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit().catch(() => connection.disconnect());
      await workerConnection.quit().catch(() => workerConnection.disconnect());
    }
  });

  it('runs the latest coalesce-latest dispatch once after duplicates arrive while active', async () => {
    const prefix = `arc-test-${Date.now()}-active`;
    const queueName = 'bullmq-job-dispatcher';
    const deduplicationKey = 'user-send-welcome-email--user-2';
    const processedUserIds: string[] = [];
    let releaseActiveJob: (() => void) | undefined;
    let activeJobStarted!: () => void;
    const activeJobStartedPromise = new Promise<void>((resolve) => {
      activeJobStarted = resolve;
    });
    const releaseActiveJobPromise = new Promise<void>((resolve) => {
      releaseActiveJob = resolve;
    });
    const connection = newRedis();
    const workerConnection = newRedis();
    const queue = new Queue<
      AppJobPayloadMap[AppJobName],
      unknown,
      AppJobName
    >(queueName, {
      connection,
      prefix,
    });
    const worker = new Worker<
      AppJobPayloadMap[AppJobName],
      unknown,
      AppJobName
    >(queueName, async (job) => {
      const userId = (
        job.data as AppJobPayloadMap['user.send-welcome-email']
      ).userId;
      processedUserIds.push(userId);

      if (userId === 'active') {
        activeJobStarted();
        await releaseActiveJobPromise;
      }
    }, {
      connection: workerConnection,
      prefix,
    });
    const dispatcher = new BullMqJobDispatcher(
      newQueueConfig(queueName, prefix),
      connection,
    );

    try {
      await worker.waitUntilReady();

      await dispatcher.dispatch(
        appJobName.sendWelcomeEmail,
        { userId: 'active', email: 'member@example.com' },
        {
          deduplicationKey,
          deduplicationMode: 'coalesce-latest',
        },
      );
      await waitForPromise(
        activeJobStartedPromise,
        5_000,
        'Timed out waiting for the first projection job to become active',
      );

      await dispatcher.dispatch(
        appJobName.sendWelcomeEmail,
        { userId: 'middle', email: 'member@example.com' },
        {
          deduplicationKey,
          deduplicationMode: 'coalesce-latest',
        },
      );
      await dispatcher.dispatch(
        appJobName.sendWelcomeEmail,
        { userId: 'latest', email: 'member@example.com' },
        {
          deduplicationKey,
          deduplicationMode: 'coalesce-latest',
        },
      );

      releaseActiveJob?.();
      releaseActiveJob = undefined;

      await waitFor(() => {
        expect(processedUserIds).toEqual(['active', 'latest']);
      });
    }
    finally {
      releaseActiveJob?.();
      await dispatcher.onApplicationShutdown();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit().catch(() => connection.disconnect());
      await workerConnection.quit().catch(() => workerConnection.disconnect());
    }
  });

  it('keeps omitted-mode deduplicated jobs idempotent', async () => {
    const prefix = `arc-test-${Date.now()}-stable`;
    const queueName = 'bullmq-job-dispatcher';
    const deduplicationKey = 'catalog-project-product--product-1';
    const processedProductIds: string[] = [];
    const connection = newRedis();
    const workerConnection = newRedis();
    const queue = new Queue(queueName, {
      connection,
      prefix,
    });
    const worker = new Worker<AppJobPayloadMap['catalog.project-product']>(
      queueName,
      async (job) => {
        processedProductIds.push(job.data.productId);
      },
      {
        connection: workerConnection,
        prefix,
      },
    );
    const dispatcher = new BullMqJobDispatcher(
      newQueueConfig(queueName, prefix),
      connection,
    );

    try {
      await worker.waitUntilReady();

      await dispatcher.dispatch(
        appJobName.projectCatalogProduct,
        { productId: 'product-1' },
        { deduplicationKey },
      );
      await waitForCompleted(queue, deduplicationKey);

      await dispatcher.dispatch(
        appJobName.projectCatalogProduct,
        { productId: 'product-1' },
        { deduplicationKey },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(processedProductIds).toEqual(['product-1']);
    }
    finally {
      await dispatcher.onApplicationShutdown();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit().catch(() => connection.disconnect());
      await workerConnection.quit().catch(() => workerConnection.disconnect());
    }
  });
});
