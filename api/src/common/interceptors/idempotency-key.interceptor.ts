import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Cache } from 'cache-manager';
import type { Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import { from, lastValueFrom, Observable } from 'rxjs';
import {
  IDEMPOTENCY_OPTIONS,
  IDEMPOTENCY_REDIS,
  type IdempotencyOptions,
} from './idempotency.constants';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_STATUS_HEADER = 'Idempotency-Status';
const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed';
const DEFAULT_RESPONSE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 30 * 1000;

interface CachedIdempotencyResponse {
  fingerprint: string;
  responseBody: unknown;
  statusCode: number;
}

type IdempotencyRedisClient = Pick<RedisClientType, 'set' | 'del'>;

@Injectable()
export class IdempotencyKeyInterceptor implements NestInterceptor {
  private readonly pendingRequests = new Map<string, string>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(IDEMPOTENCY_REDIS)
    private readonly redisClient: IdempotencyRedisClient | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<IdempotencyOptions | undefined>(
      IDEMPOTENCY_OPTIONS,
      context.getHandler(),
    );

    if (!options) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request | undefined>();
    const response = http.getResponse<Response | undefined>();

    if (!request || !response) {
      return next.handle();
    }

    const idempotencyKey = request.header(IDEMPOTENCY_KEY_HEADER)?.trim();

    if (!idempotencyKey) {
      return next.handle();
    }

    return from(
      this.handleRequest(request, response, next, idempotencyKey, options),
    );
  }

  private async handleRequest(
    request: Request,
    response: Response,
    next: CallHandler,
    idempotencyKey: string,
    options: IdempotencyOptions,
  ): Promise<unknown> {
    const cacheKey = this.buildResponseCacheKey(options.scope, idempotencyKey);
    const lockKey = this.buildLockKey(options.scope, idempotencyKey);
    const fingerprint = this.buildFingerprint(request.body);
    const cachedResponse =
      await this.cacheManager.get<CachedIdempotencyResponse>(cacheKey);

    if (cachedResponse) {
      this.assertMatchingFingerprint(cachedResponse.fingerprint, fingerprint);

      return this.buildReplayResponse(response, cachedResponse);
    }

    const lockClaimed = await this.claimRequest(
      lockKey,
      fingerprint,
      options.inFlightTtlMs ?? DEFAULT_LOCK_TTL_MS,
    );

    if (!lockClaimed) {
      throw new ConflictException(
        'A request with this idempotency key is already being processed.',
      );
    }

    try {
      const responseBody = await lastValueFrom(next.handle());
      const cachedRecord: CachedIdempotencyResponse = {
        fingerprint,
        responseBody,
        statusCode: response.statusCode,
      };

      await this.cacheManager.set(
        cacheKey,
        cachedRecord,
        options.responseTtlMs ?? DEFAULT_RESPONSE_TTL_MS,
      );
      response.setHeader(IDEMPOTENCY_STATUS_HEADER, 'created');

      return responseBody;
    }
    finally {
      await this.releaseLock(lockKey);
    }
  }

  private async claimRequest(
    lockKey: string,
    fingerprint: string,
    lockTtlMs: number,
  ): Promise<boolean> {
    if (this.redisClient) {
      const claimed = await this.redisClient.set(lockKey, fingerprint, {
        PX: lockTtlMs,
        NX: true,
      });

      return claimed === 'OK';
    }

    const pendingFingerprint = this.pendingRequests.get(lockKey);

    if (pendingFingerprint) {
      this.assertMatchingFingerprint(pendingFingerprint, fingerprint);
      return false;
    }

    this.pendingRequests.set(lockKey, fingerprint);

    return true;
  }

  private async releaseLock(lockKey: string): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.del(lockKey);
      return;
    }

    this.pendingRequests.delete(lockKey);
  }

  private buildReplayResponse(
    response: Response,
    cachedResponse: CachedIdempotencyResponse,
  ): unknown {
    response.status(cachedResponse.statusCode);
    response.setHeader(IDEMPOTENCY_STATUS_HEADER, 'cached');
    response.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');

    return cachedResponse.responseBody;
  }

  private assertMatchingFingerprint(
    actualFingerprint: string,
    expectedFingerprint: string,
  ): void {
    if (actualFingerprint !== expectedFingerprint) {
      throw new ConflictException(
        'The idempotency key has already been used with a different request payload.',
      );
    }
  }

  private buildResponseCacheKey(scope: string, idempotencyKey: string): string {
    return `${scope}:idempotency:response:${idempotencyKey}`;
  }

  private buildLockKey(scope: string, idempotencyKey: string): string {
    return `${scope}:idempotency:lock:${idempotencyKey}`;
  }

  private buildFingerprint(payload: unknown): string {
    return this.stableStringify(payload);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }

    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(
          ([key, nestedValue]) =>
            `${JSON.stringify(key)}:${this.stableStringify(nestedValue)}`,
        )
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
