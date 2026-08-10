import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import {
  getProductReferenceProductId,
} from '../../chat-product-reference';
import type { ChatConversationSummary } from '../../chat.types';
import {
  ChatProductNotFoundError,
  ChatProductShopMismatchError,
  ChatShopNotFoundError,
} from '../../errors/chat-app.error';
import {
  CHAT_MESSAGE_CREATED_EVENT,
  type ChatMessageCreatedEventPayload,
} from '../../events/chat-message-created.event';
import { ChatCommandRepository } from '../../ports/chat-command.repository';
import type { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';
import type { ChatMessageEntity } from '../../../infra/persistence/entities/chat-message.entity';

@Injectable()
export class CreateOrGetMyChatConversationUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    @Inject(ChatCommandRepository)
    private readonly chatCommands: ChatCommandRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: {
      shopId: string;
      productId?: string;
    },
  ): Promise<ChatConversationSummary> {
    const { summary, eventPayload } = await this.entityManager.fork().transactional(async (entityManager) => {
      const shop = await this.chatCommands.loadShopForConversationStart(entityManager, input.shopId);

      if (!shop) {
        throw new ChatShopNotFoundError();
      }

      const product = input.productId
        ? await this.chatCommands.loadProductForConversationReference(entityManager, input.productId)
        : null;

      if (input.productId && !product) {
        throw new ChatProductNotFoundError();
      }

      if (product && product.shop.id !== shop.id) {
        throw new ChatProductShopMismatchError();
      }

      const conversation = await this.chatCommands.loadBuyerShopConversationForStart(
        entityManager,
        actor.userId,
        shop.id,
      ) ?? this.chatCommands.createBuyerShopConversation(entityManager, actor.userId, shop);

      const productReferenceMessage = product
        ? await this.addProductReferenceMessageIfNeeded(entityManager, conversation, product)
        : null;

      await entityManager.flush();

      return {
        summary: await this.chatCommands.populateConversationSummary(entityManager, conversation),
        eventPayload: productReferenceMessage
          ? {
            conversation_id: conversation.id,
            message_id: productReferenceMessage.id,
            sender_user_id: conversation.buyerUser.id,
            recipient_user_ids: [conversation.shop.ownerUser.id],
            body: productReferenceMessage.body,
            message_type: productReferenceMessage.messageType,
            shop_id: conversation.shop.id,
            occurred_at: productReferenceMessage.createdAt.toISOString(),
            metadata: productReferenceMessage.metadata,
          } satisfies ChatMessageCreatedEventPayload
          : null,
      };
    });

    if (eventPayload) {
      this.eventEmitter.emit(CHAT_MESSAGE_CREATED_EVENT, eventPayload);
    }

    return summary;
  }

  private async addProductReferenceMessageIfNeeded(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    product: ProductEntity,
  ): Promise<ChatMessageEntity | null> {
    const existingProductReferences = await this.chatCommands.loadProductReferenceMessagesForConversation(
      entityManager,
      conversation,
    );

    if (existingProductReferences.some(message => getProductReferenceProductId(message.metadata) === product.id)) {
      return null;
    }

    return this.chatCommands.addProductReferenceMessage(entityManager, conversation, product);
  }
}
