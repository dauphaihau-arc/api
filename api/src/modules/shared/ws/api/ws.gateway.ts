import type { Request } from 'express';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { AUTH_CONFIG } from '~/config/auth.config';
import type { AuthConfig } from '~/config/auth.config';
import { parseCorsAllowedOrigins } from '~/config/cors.config';
import { AuthTokenService } from '~/modules/domains/auth/app/ports/auth-token.service';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { LoadAuthenticatedUserUseCase } from '~/modules/domains/auth/app/use-cases/load-authenticated-user/load-authenticated-user.use-case';
import { extractCookieValue } from '~/modules/domains/auth/api/rest/auth-cookie.utils';
import { ChatConversationEntity } from '~/modules/domains/chat/infra/persistence/entities/chat-conversation.entity';
import { buildConversationWsChannelKey, buildUserWsChannelKey } from '../app/channel-keys';
import { WsRedisAdapterService } from '../infra/ws-redis-adapter.service';
import { WsPublisher } from '../infra/ws.publisher';

type AuthenticatedSocket = Socket & {
  // eslint-disable-next-line id-denylist
  data: Socket['data'] & {
    authenticatedUser?: AuthenticatedUser;
  };
};

type ConversationSubscriptionPayload = {
  conversation_id: string;
};

const WS_NAMESPACE = '/ws';

@Injectable()
@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: parseCorsAllowedOrigins(process.env),
    credentials: true,
  },
})
export class WsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGateway.name);

  constructor(
    private readonly wsPublisher: WsPublisher,
    private readonly wsRedisAdapterService: WsRedisAdapterService,
    private readonly entityManager: EntityManager,
    private readonly authTokenService: AuthTokenService,
    private readonly loadAuthenticatedUserUseCase: LoadAuthenticatedUserUseCase,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig
  ) {}

  async afterInit(namespace: Namespace): Promise<void> {
    this.wsPublisher.attachServer(namespace);
    await this.wsRedisAdapterService.attach(namespace);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const authenticatedUser = await this.authenticate(client);

    if (!authenticatedUser) {
      client.emit('system.error', {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
      client.disconnect(true);
      return;
    }

    client.data.authenticatedUser = authenticatedUser;
    await client.join(buildUserWsChannelKey(authenticatedUser.userId));

    client.emit('system.connected', {
      userId: authenticatedUser.userId,
      namespace: WS_NAMESPACE,
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('conversation.subscribe')
  async subscribeConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: ConversationSubscriptionPayload
  ) {
    if (!client.data.authenticatedUser) {
      client.disconnect(true);
      return { ok: false, error: 'UNAUTHORIZED' };
    }

    const authenticatedUser = client.data.authenticatedUser as AuthenticatedUser;
    const canAccessConversation = await this.canAccessConversation(
      authenticatedUser,
      body.conversation_id
    );

    if (!canAccessConversation) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    await client.join(buildConversationWsChannelKey(body.conversation_id));

    return {
      ok: true,
      conversation_id: body.conversation_id,
    };
  }

  @SubscribeMessage('conversation.unsubscribe')
  unsubscribeConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: ConversationSubscriptionPayload
  ) {
    if (!client.data.authenticatedUser) {
      client.disconnect(true);
      return { ok: false, error: 'UNAUTHORIZED' };
    }

    void client.leave(buildConversationWsChannelKey(body.conversation_id));

    return {
      ok: true,
      conversation_id: body.conversation_id,
    };
  }

  private async authenticate(client: Socket): Promise<AuthenticatedUser | null> {
    const accessToken = extractCookieValue(
      {
        headers: {
          cookie: client.handshake.headers.cookie,
        },
      } as Request,
      this.authConfig.accessCookieName
    );

    if (!accessToken) {
      this.logger.warn(`WS connection rejected: missing access cookie for socket ${client.id}`);
      return null;
    }

    const payload = await this.authTokenService.verifyAccessToken(accessToken);

    if (!payload) {
      this.logger.warn(`WS connection rejected: invalid access token for socket ${client.id}`);
      return null;
    }

    const authenticatedUser = await this.loadAuthenticatedUserUseCase.execute(
      payload.sub,
      payload.sessionId
    );

    if (!authenticatedUser.isOk) {
      this.logger.warn(`WS connection rejected: inactive session for socket ${client.id}`);
      return null;
    }

    return authenticatedUser.value;
  }

  private async canAccessConversation(
    actor: AuthenticatedUser,
    conversationId: string
  ): Promise<boolean> {
    const conversation = await this.entityManager.fork().getRepository(ChatConversationEntity).findOne(
      { id: conversationId },
      { populate: ['buyerUser', 'shop.ownerUser'] }
    );

    if (!conversation) {
      return false;
    }

    if (conversation.buyerUser.id === actor.userId) {
      return true;
    }

    if (conversation.shop.ownerUser.id === actor.userId) {
      return true;
    }

    return actor.roles.includes('admin');
  }
}
