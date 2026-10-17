import { Logger } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  DurableOutboxProcessor,
  type DurableOutboxOptions,
} from '~/platform/outbox/durable-outbox.processor';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '~/platform/outbox/outbox-event.entity';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

const OWNED_EVENT_NAME = 'order.checkout-session-requested';

describe('DurableOutboxProcessor (integration)', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;
  let logger: Logger;

  function buildProcessor(
    overrides: Partial<DurableOutboxOptions> = {},
  ): DurableOutboxProcessor {
    return new DurableOutboxProcessor(orm.em, logger, {
      eventName: OWNED_EVENT_NAME,
      dueStatuses: [
        OutboxEventStatus.PENDING,
        OutboxEventStatus.PROCESSING,
      ],
      failureLogPrefix: 'Failed processing outbox event',
      unknownErrorMessage: 'Unknown checkout outbox failure',
      ...overrides,
    });
  }

  async function insertEvent(
    overrides: Partial<OutboxEventEntity> = {},
  ): Promise<string> {
    const entityManager = orm.em.fork();
    const event = entityManager.create(OutboxEventEntity, {
      eventName: OWNED_EVENT_NAME,
      aggregateType: 'order',
      aggregateId: 'order-1',
      payload: { orderIds: ['order-1'] },
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(Date.now() - 1_000),
      ...overrides,
    });
    await entityManager.persistAndFlush(event);

    return event.id;
  }

  async function readEvent(eventId: string): Promise<OutboxEventEntity> {
    // A fresh fork avoids the identity map returning a stale row.
    return orm.em.fork().findOneOrFail(OutboxEventEntity, { id: eventId });
  }

  beforeAll(async () => {
    testDb = await createTestDatabase('durable_outbox');
    orm = await MikroORM.init(
      buildDatabaseConfig(
        {
          ...process.env,
          DATABASE_URL: undefined,
          DB_HOST: testDb.rootConfig.host,
          DB_PORT: String(testDb.rootConfig.port),
          DB_USER: testDb.rootConfig.user,
          DB_PASSWORD: testDb.rootConfig.password,
          DB_NAME: testDb.dbName,
        },
        { includeEntityGlobs: true, debug: false },
      ),
    );

    logger = new Logger('durable-outbox-int');
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await orm?.close(true);
    await dropTestDatabase(testDb);
  });

  afterEach(async () => {
    await orm.em.fork().nativeDelete(OutboxEventEntity, {});
  });

  it('lets only one of two concurrent pollers claim the same event', async () => {
    const eventId = await insertEvent();
    const pollerA = buildProcessor();
    const pollerB = buildProcessor();

    const [claimedByA, claimedByB] = await Promise.all([
      pollerA.claim(eventId),
      pollerB.claim(eventId),
    ]);

    const claims = [claimedByA, claimedByB].filter((claim) => claim !== null);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.attemptCount).toBe(1);

    const row = await readEvent(eventId);
    expect(row.status).toBe(OutboxEventStatus.PROCESSING);
    expect(row.attemptCount).toBe(1);
  });

  it('refuses a leased event and returns it to the pool once the lease expires', async () => {
    const eventId = await insertEvent();
    const processor = buildProcessor();

    const firstClaim = await processor.claim(eventId);
    expect(firstClaim).not.toBeNull();
    expect(await processor.claim(eventId)).toBeNull();

    const leased = await readEvent(eventId);
    expect(leased.availableAt.getTime()).toBeGreaterThan(Date.now());

    await orm.em
      .fork()
      .nativeUpdate(
        OutboxEventEntity,
        { id: eventId },
        { availableAt: new Date(Date.now() - 1_000) },
      );

    const reclaimed = await processor.claim(eventId);
    expect(reclaimed?.attemptCount).toBe(2);

    const row = await readEvent(eventId);
    expect(row.status).toBe(OutboxEventStatus.PROCESSING);
    expect(row.attemptCount).toBe(2);
  });

  it('releases a claimed event as processed', async () => {
    const eventId = await insertEvent();
    const processor = buildProcessor();
    const claimed = await processor.claim(eventId);

    await processor.markProcessed(eventId);

    const row = await readEvent(eventId);
    expect(row.status).toBe(OutboxEventStatus.PROCESSED);
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(row.attemptCount).toBe(claimed?.attemptCount);
    expect(await processor.claim(eventId)).toBeNull();
  });

  it('leaves a failed attempt retryable with backoff and the error recorded', async () => {
    const eventId = await insertEvent();
    const processor = buildProcessor();
    const claimed = await processor.claim(eventId);

    await processor.markFailed(
      claimed!.eventId,
      claimed!.attemptCount,
      new Error('Stripe down'),
    );

    const row = await readEvent(eventId);
    expect(row.status).toBe(OutboxEventStatus.PENDING);
    expect(row.attemptCount).toBe(1);
    expect(row.lastError).toBe('Stripe down');
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(await processor.claim(eventId)).toBeNull();
  });

  it('marks an attempt past the limit terminally failed', async () => {
    const eventId = await insertEvent();
    const processor = buildProcessor();
    const claimed = await processor.claim(eventId);

    await processor.markFailed(
      claimed!.eventId,
      claimed!.attemptCount,
      new Error('Stripe down'),
    );
    await processor.markFailed(
      claimed!.eventId,
      5,
      new Error('Stripe still down'),
    );

    const row = await readEvent(eventId);
    expect(row.status).toBe(OutboxEventStatus.FAILED);
    expect(row.lastError).toBe('Stripe still down');
    expect(await processor.claim(eventId)).toBeNull();
  });

  it('scans only the events it owns and only the statuses it declares as due', async () => {
    const duePending = await insertEvent();
    const otherEventName = await insertEvent({
      eventName: 'order.created',
    });
    const leasedProcessing = await insertEvent({
      status: OutboxEventStatus.PROCESSING,
      attemptCount: 1,
      availableAt: new Date(Date.now() - 1_000),
    });

    const recoveringIds: string[] = [];
    await buildProcessor().processDueEvents(async (eventId) => {
      recoveringIds.push(eventId);

      return true;
    });

    // A processor that scans `processing` recovers the expired lease and ignores
    // events of another name.
    expect(recoveringIds).toHaveLength(2);
    expect(recoveringIds).toContain(duePending);
    expect(recoveringIds).toContain(leasedProcessing);
    expect(recoveringIds).not.toContain(otherEventName);

    const pendingOnlyIds: string[] = [];
    await buildProcessor({
      dueStatuses: [OutboxEventStatus.PENDING],
    }).processDueEvents(async (eventId) => {
      pendingOnlyIds.push(eventId);

      return true;
    });

    // A processor that scans only `pending` leaves the crashed event untouched.
    expect(pendingOnlyIds).toEqual([duePending]);
  });
});
