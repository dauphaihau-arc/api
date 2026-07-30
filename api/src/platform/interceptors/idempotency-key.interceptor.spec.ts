import type { Cache } from 'cache-manager';
import {
  ConflictException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyKeyInterceptor } from './idempotency-key.interceptor';

type RedisClientMock = {
  set: jest.Mock;
  del: jest.Mock;
};

describe('IdempotencyKeyInterceptor', () => {
  const payload = {
    email: 'member@example.com',
    password: 'password123',
    displayName: 'Member User',
  };
  const options = {
    scope: 'auth:register',
  };

  function createHttpContext(
    idempotencyKey?: string,
    body: unknown = payload,
    statusCode = 201,
  ): {
    context: ExecutionContext;
    request: Pick<Request, 'body' | 'header'>;
    response: Pick<Response, 'statusCode' | 'status' | 'setHeader'>;
  } {
    const request: Pick<Request, 'body' | 'header'> = {
      body,
      header: ((name: string) =>
        name.toLowerCase() === 'idempotency-key' ? idempotencyKey : undefined) as
        Request['header'],
    };
    const response: Pick<Response, 'statusCode' | 'status' | 'setHeader'> = {
      statusCode,
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    const handler = () => undefined;

    return {
      request,
      response,
      context: {
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext,
    };
  }

  function createReflector(): Pick<Reflector, 'get'> {
    return {
      get: jest.fn().mockReturnValue(options),
    };
  }

  it('passes through when idempotency metadata is missing', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const reflector: Pick<Reflector, 'get'> = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      reflector as Reflector,
      cacheManager as unknown as Cache,
      null,
    );
    const { context } = createHttpContext('register-1');
    const next: CallHandler = {
      handle: jest.fn(() => of({ accessToken: 'access-token' })),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ accessToken: 'access-token' });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(cacheManager.get).not.toHaveBeenCalled();
  });

  it('passes through when the idempotency key header is missing', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      createReflector() as Reflector,
      cacheManager as unknown as Cache,
      null,
    );
    const { context } = createHttpContext();
    const next: CallHandler = {
      handle: jest.fn(() => of({ accessToken: 'access-token' })),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ accessToken: 'access-token' });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(cacheManager.get).not.toHaveBeenCalled();
  });

  it('replays a cached response for the same idempotency key and payload', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue({
        fingerprint:
          '{"displayName":"Member User","email":"member@example.com","password":"password123"}',
        responseBody: { accessToken: 'cached-token' },
        statusCode: 201,
      }),
      set: jest.fn(),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      createReflector() as Reflector,
      cacheManager as unknown as Cache,
      null,
    );
    const { context, response } = createHttpContext('register-1');
    const next: CallHandler = {
      handle: jest.fn(() => of({ accessToken: 'fresh-token' })),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ accessToken: 'cached-token' });
    expect(next.handle).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotency-Status',
      'cached',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotency-Replayed',
      'true',
    );
  });

  it('rejects reuse of the same idempotency key with a different payload', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue({
        fingerprint: '{"email":"member@example.com","password":"password123"}',
        responseBody: { accessToken: 'cached-token' },
        statusCode: 201,
      }),
      set: jest.fn(),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      createReflector() as Reflector,
      cacheManager as unknown as Cache,
      null,
    );
    const { context } = createHttpContext('register-1', {
      email: 'member@example.com',
      password: 'password123',
      displayName: 'Different Name',
    });

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: jest.fn(() => of({ accessToken: 'fresh-token' })),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the first successful response and releases the redis lock', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const redisClient: RedisClientMock = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      createReflector() as Reflector,
      cacheManager as unknown as Cache,
      redisClient as never,
    );
    const { context, response } = createHttpContext('register-1');
    const next: CallHandler = {
      handle: jest.fn(() => of({ accessToken: 'fresh-token' })),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ accessToken: 'fresh-token' });
    expect(redisClient.set).toHaveBeenCalledWith(
      'auth:register:idempotency:lock:register-1',
      '{"displayName":"Member User","email":"member@example.com","password":"password123"}',
      { PX: 30000, NX: true },
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'auth:register:idempotency:response:register-1',
      expect.objectContaining({
        responseBody: { accessToken: 'fresh-token' },
        statusCode: 201,
      }),
      86400000,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Idempotency-Status',
      'created',
    );
    expect(redisClient.del).toHaveBeenCalledWith(
      'auth:register:idempotency:lock:register-1',
    );
  });

  it('rejects a duplicate request while the same key is already in flight', async () => {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    };
    const redisClient: RedisClientMock = {
      set: jest.fn().mockResolvedValue(null),
      del: jest.fn(),
    };
    const interceptor = new IdempotencyKeyInterceptor(
      createReflector() as Reflector,
      cacheManager as unknown as Cache,
      redisClient as never,
    );
    const { context } = createHttpContext('register-1');

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: jest.fn(() => of({ accessToken: 'fresh-token' })),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
