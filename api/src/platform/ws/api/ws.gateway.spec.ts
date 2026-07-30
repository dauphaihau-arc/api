import type { AuthConfig } from '~/platform/config/auth.config';
import type { AuthTokenService } from '~/domains/auth/app/ports/auth-token.service';
import type { Ok } from '~/platform/application/result';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { WsGateway } from './ws.gateway';

function okResult<TValue>(value: TValue): Ok<TValue> {
  return {
    isOk: true,
    value,
  };
}

describe('WsGateway', () => {
  const authConfig: AuthConfig = {
    jwtAccessSecret: 'secret',
    jwtAccessTtlSeconds: 60,
    jwtRefreshSecret: 'refresh-secret',
    jwtRefreshTtlSeconds: 120,
    accessCookieName: 'accessToken',
    refreshCookieName: 'refreshToken',
    cookiePath: '/',
    cookieSameSite: 'lax',
    cookieSecure: false,
    bcryptSaltRounds: 12,
  };

  function buildSocket(overrides?: Record<string, unknown>) {
    return {
      id: 'socket-1',
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      handshake: {
        headers: {},
      },
      ...(overrides ?? {}),
    };
  }

  function buildGateway(overrides?: {
    entityManager?: unknown;
    authTokenService?: unknown;
    loadAuthenticatedUserUseCase?: unknown;
    wsPublisher?: unknown;
    wsRedisAdapterService?: unknown;
  }) {
    return new WsGateway(
      (overrides?.wsPublisher ?? {
        attachServer: jest.fn(),
      }) as never,
      (overrides?.wsRedisAdapterService ?? {
        attach: jest.fn().mockResolvedValue(undefined),
      }) as never,
      (overrides?.entityManager ?? { fork: jest.fn() }) as never,
      (overrides?.authTokenService ?? { verifyAccessToken: jest.fn() }) as never,
      (overrides?.loadAuthenticatedUserUseCase ?? { execute: jest.fn() }) as never,
      authConfig,
    );
  }

  it('attaches the Socket.IO server to the publisher and Redis adapter on init', async () => {
    const wsPublisher = { attachServer: jest.fn() };
    const wsRedisAdapterService = {
      attach: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = buildGateway({
      wsPublisher,
      wsRedisAdapterService,
    });
    const server = {} as never;

    await gateway.afterInit(server);

    expect(wsPublisher.attachServer).toHaveBeenCalledWith(server);
    expect(wsRedisAdapterService.attach).toHaveBeenCalledWith(server);
  });

  it('joins an authenticated socket to its user room on connect', async () => {
    const authTokenService = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'access',
      }),
    } as unknown as jest.Mocked<AuthTokenService>;
    const loadAuthenticatedUserUseCase = {
      execute: jest.fn().mockResolvedValue(okResult({
        userId: 'user-1',
        email: 'user@example.com',
        sessionId: 'session-1',
        status: 'active' as AuthenticatedUser['status'],
        roles: [],
        permissions: [],
      })),
    };
    const gateway = buildGateway({
      authTokenService,
      loadAuthenticatedUserUseCase,
    });
    const client = buildSocket({
      handshake: {
        headers: {
          cookie: 'accessToken=token-123',
        },
      },
    });

    await gateway.handleConnection(client as never);

    expect(authTokenService.verifyAccessToken).toHaveBeenCalledWith('token-123');
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.emit).toHaveBeenCalledWith('system.connected', {
      userId: 'user-1',
      namespace: '/ws',
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated sockets', async () => {
    const gateway = buildGateway();
    const client = buildSocket({
      id: 'socket-2',
      handshake: {
        headers: {},
      },
    });

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith('system.error', {
      code: 'UNAUTHORIZED',
      message: 'Authentication is required',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins and leaves a conversation room for authorized sockets', async () => {
    const entityManager = {
      fork: jest.fn().mockReturnValue({
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({
            buyerUser: { id: 'user-1' },
            shop: { ownerUser: { id: 'seller-1' } },
          }),
        }),
      }),
    };
    const gateway = buildGateway({ entityManager });
    const client = buildSocket({
      data: {
        authenticatedUser: {
          userId: 'user-1',
          roles: [],
        },
      },
    });

    await expect(gateway.subscribeConversation(client as never, { conversation_id: 'conversation-1' })).resolves.toEqual({
      ok: true,
      conversation_id: 'conversation-1',
    });
    expect(client.join).toHaveBeenCalledWith('conversation:conversation-1');

    expect(gateway.unsubscribeConversation(client as never, { conversation_id: 'conversation-1' })).toEqual({
      ok: true,
      conversation_id: 'conversation-1',
    });
    expect(client.leave).toHaveBeenCalledWith('conversation:conversation-1');
  });
});
