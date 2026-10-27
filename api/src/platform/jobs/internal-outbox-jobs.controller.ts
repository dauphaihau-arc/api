import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import {
  RunPayoutsUseCase,
  type PayoutRunSummary,
} from '~/domains/finance/app/use-cases/run-payouts/run-payouts.use-case';
import { OrderCheckoutOutboxService } from '~/domains/order/app/services/order-checkout-outbox.service';
import { OrderInventoryOutboxPublisherService } from '~/domains/order/app/services/order-inventory-outbox-publisher.service';
import { OrderRefundService } from '~/domains/order/app/services/order-refund.service';

const CRON_SECRET_HEADER = 'x-cron-secret';
const DRAIN_TRIGGER_SECRET_ENV = 'OUTBOX_DRAIN_TRIGGER_SECRET';
const DEFAULT_DRAIN_LIMIT = 10;
const MAX_DRAIN_LIMIT = 50;
const DRAIN_BUDGET_MS = 20_000;

export const DRAIN_TASKS = [
  'finance',
  'checkout',
  'inventory',
  'refunds',
  'payout',
] as const;

export type DrainTask = (typeof DRAIN_TASKS)[number];

export interface DrainFailure {
  task: string;
  message: string;
}

export interface InternalOutboxDrainResponse {
  ok: boolean;
  finance: number;
  checkout: number;
  inventory: number;
  refunds: number;
  payoutRun: PayoutRunSummary | null;
  failures: DrainFailure[];
  skipped: string[];
}

/**
 * The single authenticated tick an external cron calls to drain every
 * outbox/reconciliation poller from the API process, so production works with
 * `QUEUE_DRIVER=inline` and no background worker. Each task is isolated: one
 * failure never prevents the rest from draining, and the response still
 * reports every count.
 */
@Controller('internal/jobs')
@SkipThrottle()
@ApiExcludeController()
export class InternalOutboxJobsController {
  private readonly logger = new Logger(InternalOutboxJobsController.name);

  constructor(
    private readonly financeMoneyEventProcessorService: FinanceMoneyEventProcessorService,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
    private readonly orderInventoryOutboxPublisherService: OrderInventoryOutboxPublisherService,
    private readonly orderRefundService: OrderRefundService,
    private readonly runPayoutsUseCase: RunPayoutsUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Post('drain')
  @HttpCode(200)
  async drain(
    @Headers(CRON_SECRET_HEADER) providedSecret?: string,
    @Query('limit') limitParam?: string,
    @Query('tasks') tasksParam?: string,
  ): Promise<InternalOutboxDrainResponse> {
    this.assertAuthorized(providedSecret);

    const limit = parseLimit(limitParam);
    const tasks = parseTasks(tasksParam);

    const response: InternalOutboxDrainResponse = {
      ok: true,
      finance: 0,
      checkout: 0,
      inventory: 0,
      refunds: 0,
      payoutRun: null,
      failures: [],
      skipped: [],
    };

    const deadline = Date.now() + DRAIN_BUDGET_MS;

    for (const task of tasks) {
      if (Date.now() >= deadline) {
        response.skipped.push(task);
        continue;
      }

      try {
        switch (task) {
          case 'finance':
            response.finance =
              await this.financeMoneyEventProcessorService.processPendingEvents(
                limit,
              );
            break;
          case 'checkout':
            response.checkout =
              await this.orderCheckoutOutboxService.processPendingEvents(limit);
            break;
          case 'inventory':
            response.inventory =
              await this.orderInventoryOutboxPublisherService.processPendingEvents(
                limit,
              );
            break;
          case 'refunds':
            response.refunds =
              await this.orderRefundService.reconcilePendingRefunds(limit);
            break;
          case 'payout':
            response.payoutRun = await this.runPayoutsUseCase.execute();
            break;
        }
      }
      catch (error) {
        response.failures.push({
          task,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    response.ok = response.failures.length === 0;

    this.logger.log(
      `Outbox drain limit=${limit} finance=${response.finance} ` +
      `checkout=${response.checkout} inventory=${response.inventory} ` +
      `refunds=${response.refunds} ` +
      `payoutRun=${response.payoutRun?.runDay ?? 'none'} ` +
      `failures=${response.failures.length} skipped=${response.skipped.length}`,
    );

    if (!response.ok) {
      throw new HttpException(
        response,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return response;
  }

  private assertAuthorized(providedSecret?: string): void {
    const configuredSecret = this.configService.get<string>(
      DRAIN_TRIGGER_SECRET_ENV,
    );

    if (!configuredSecret) {
      throw new HttpException(
        'Outbox drain trigger is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!providedSecret || !secretsMatch(configuredSecret, providedSecret)) {
      throw new UnauthorizedException('Invalid cron secret');
    }
  }
}

function parseLimit(rawLimit?: string): number {
  if (rawLimit === undefined) {
    return DEFAULT_DRAIN_LIMIT;
  }

  const trimmed = rawLimit.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new BadRequestException(`Invalid limit: ${rawLimit}`);
  }

  const limit = Number(trimmed);

  if (limit < 1) {
    throw new BadRequestException(`Invalid limit: ${rawLimit}`);
  }

  return Math.min(limit, MAX_DRAIN_LIMIT);
}

function parseTasks(rawTasks?: string): DrainTask[] {
  if (rawTasks === undefined || rawTasks.trim() === '') {
    return [...DRAIN_TASKS];
  }

  const requested = new Set<DrainTask>();

  for (const name of rawTasks.split(',')) {
    const trimmed = name.trim();

    if (!trimmed) {
      continue;
    }

    if (!isDrainTask(trimmed)) {
      throw new BadRequestException(`Unknown drain task: ${trimmed}`);
    }

    requested.add(trimmed);
  }

  return DRAIN_TASKS.filter((task) => requested.has(task));
}

function isDrainTask(value: string): value is DrainTask {
  return (DRAIN_TASKS as readonly string[]).includes(value);
}

function secretsMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
