import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Logger } from '@nestjs/common';
import ms from 'ms';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from './outbox-event.entity';

/**
 * Tuning the checkout processor has always used. Every outbox processor claims,
 * leases, retries, and fails on these values; a processor must not invent its own.
 */
const RETRY_DELAYS_MS = [
  ms('15s'),
  ms('1m'),
  ms('5m'),
  ms('15m'),
  ms('1h'),
];
const MAX_ATTEMPTS = 5;
const LEASE_MS = ms('30s');
export const DURABLE_OUTBOX_BATCH_SIZE = 10;

export interface DurableOutboxOptions {
  /** Event name this processor owns. Events of any other name are never claimed or scanned. */
  eventName: string;

  /**
   * Statuses that count as due for the pending scan. Including `processing`
   * recovers an event whose lease expired when a previous poller crashed;
   * excluding it leaves crashed events untouched.
   */
  dueStatuses: OutboxEventStatus[];

  /** Prefix of the logged failure line, e.g. "Failed processing outbox event". */
  failureLogPrefix: string;

  /** Error text recorded when a thrown value is not an Error. */
  unknownErrorMessage: string;
}

export interface ClaimedOutboxEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  attemptCount: number;
  payload: TPayload;
}

/**
 * The durable outbox's claim, lease, retry-backoff, and terminal-failure
 * behaviour, shared by every processor of the `outbox_events` table.
 *
 * A claim locks the row, refuses anything already processed, failed, leased, or
 * owned by another event name, then moves the event to `processing`, increments
 * its attempt count, and leases it. Success marks the event `processed`. A
 * failure records the error and either re-arms the event after the backoff step
 * for its attempt count or marks it terminally `failed` past the attempt limit.
 */
export class DurableOutboxProcessor {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly logger: Logger,
    private readonly options: DurableOutboxOptions,
  ) {}

  /**
   * Scans the events this processor owns that are due now and hands each id to
   * the handler, counting how many the handler reports as processed.
   */
  async processDueEvents(
    handler: (eventId: string) => Promise<boolean>,
    limit = DURABLE_OUTBOX_BATCH_SIZE,
  ): Promise<number> {
    const { dueStatuses } = this.options;

    // One status renders bare, several render as `$in`, matching what each
    // processor already issued.
    const status = dueStatuses.length === 1
      ? dueStatuses[0]
      : { $in: dueStatuses };

    const entityManager = this.entityManager.fork();

    const dueEvents = await entityManager.find(
      OutboxEventEntity,
      {
        eventName: this.options.eventName,
        status,
        availableAt: { $lte: new Date() },
      },
      {
        orderBy: { createdAt: 'asc' },
        limit,
      },
    );

    let processedCount = 0;

    for (const event of dueEvents) {
      if (await handler(event.id)) {
        processedCount += 1;
      }
    }

    return processedCount;
  }

  /** Claims a due event, or returns `null` when it is not this processor's to run. */
  async claim<TPayload = Record<string, unknown>>(
    eventId: string,
  ): Promise<ClaimedOutboxEvent<TPayload> | null> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOne(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!event) {
        return null;
      }

      if (event.eventName !== this.options.eventName) {
        return null;
      }

      if (
        event.status === OutboxEventStatus.PROCESSED
        || event.status === OutboxEventStatus.FAILED
      ) {
        return null;
      }

      if (event.availableAt > new Date()) {
        return null;
      }

      event.status = OutboxEventStatus.PROCESSING;
      event.attemptCount += 1;
      event.availableAt = new Date(Date.now() + LEASE_MS);
      event.lastError = undefined;

      await entityManager.flush();

      return {
        eventId: event.id,
        attemptCount: event.attemptCount,
        payload: event.payload as TPayload,
      };
    });
  }

  /**
   * Applies the processed state to an event already locked by the caller's
   * transaction, so a processor can commit its own work with the release.
   */
  applyProcessedState(event: OutboxEventEntity): void {
    event.status = OutboxEventStatus.PROCESSED;
    event.processedAt = new Date();
    event.lastError = undefined;
  }

  /** Releases a claimed event as processed in its own transaction. */
  async markProcessed(eventId: string): Promise<void> {
    await this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOneOrFail(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      this.applyProcessedState(event);

      await entityManager.flush();
    });
  }

  /**
   * Records a failed attempt. The event stays retryable with backoff until the
   * attempt limit, after which it is terminally failed.
   */
  async markFailed(
    eventId: string,
    attemptCount: number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error
      ? error.message
      : this.options.unknownErrorMessage;
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `${this.options.failureLogPrefix} ${eventId}: ${message}`,
      stack,
    );

    await this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOneOrFail(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      event.lastError = message;

      if (attemptCount >= MAX_ATTEMPTS) {
        event.status = OutboxEventStatus.FAILED;
        await entityManager.flush();
        return;
      }

      event.status = OutboxEventStatus.PENDING;
      event.availableAt = new Date(
        Date.now() +
          RETRY_DELAYS_MS[
            Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
          ],
      );

      await entityManager.flush();
    });
  }
}
