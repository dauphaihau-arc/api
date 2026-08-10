import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { buildChatMessageBodyPreview } from '../../chat-message-preview';
import {
  buildChatProductReferenceMetadata,
  CHAT_MESSAGE_TYPES,
  getProductReferenceProductId,
} from '../../chat-product-reference';
import { toChatConversationSummary } from '../../chat-read-model';
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
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '../../../infra/persistence/entities/chat-message.entity';

@Injectable()
export class CreateOrGetMyChatConversationUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: {
      shopId: string;
      productId?: string;
    },
  ): Promise<ChatConversationSummary> {
    const entityManager = this.entityManager.fork();

    const shop = await entityManager.getRepository(ShopEntity).findOne(
      { id: input.shopId },
      { populate: ['ownerUser'] },
    );

    if (!shop) {
      throw new ChatShopNotFoundError();
    }

    let product: ProductEntity | null = null;

    if (input.productId) {
      product = await entityManager.getRepository(ProductEntity).findOne(
        { id: input.productId },
        {
          populate: [
            'shop',
            'images.variants',
            'inventoryRecords.prices',
          ],
        },
      );

      if (!product) {
        throw new ChatProductNotFoundError();
      }

      if (product.shop.id !== shop.id) {
        throw new ChatProductShopMismatchError();
      }
    }

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      {
        buyerUser: actor.userId,
        shop: shop.id,
      },
      { populate: ['buyerUser', 'shop.ownerUser', 'lastMessage', 'lastMessageSenderUser'] },
    );

    if (conversation) {
      await this.addProductReferenceMessageIfNeeded(entityManager, conversation, product);
      await entityManager.populate(conversation, ['buyerUser', 'shop.ownerUser', 'lastMessage', 'lastMessageSenderUser']);
      return toChatConversationSummary(conversation);
    }

    const createdConversation = new ChatConversationEntity();
    createdConversation.buyerUser = entityManager.getReference(CurrentUserEntity, actor.userId);
    createdConversation.shop = shop;

    await entityManager.persist(createdConversation).flush();
    await this.addProductReferenceMessageIfNeeded(entityManager, createdConversation, product);
    await entityManager.populate(createdConversation, ['buyerUser', 'shop.ownerUser', 'lastMessage', 'lastMessageSenderUser']);

    return toChatConversationSummary(createdConversation);
  }

  private async addProductReferenceMessageIfNeeded(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    product: ProductEntity | null,
  ): Promise<void> {
    if (!product) {
      return;
    }

    const existingProductReferences = await entityManager.getRepository(ChatMessageEntity).find({
      conversation,
      messageType: CHAT_MESSAGE_TYPES.PRODUCT_REFERENCE,
    });

    if (existingProductReferences.some(message => getProductReferenceProductId(message.metadata) === product.id)) {
      return;
    }

    const message = new ChatMessageEntity();
    message.conversation = conversation;
    message.senderUser = conversation.buyerUser;
    message.messageType = CHAT_MESSAGE_TYPES.PRODUCT_REFERENCE;
    message.body = product.title;
    message.metadata = buildChatProductReferenceMetadata(product);

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageSenderUser = message.senderUser;
    conversation.lastMessage = message;
    conversation.lastMessageBodyPreview = buildChatMessageBodyPreview(message.body);
    conversation.lastMessageType = message.messageType;
    conversation.buyerLastReadAt = message.createdAt;
    conversation.buyerUnreadCount = 0;
    conversation.sellerUnreadCount += 1;

    await entityManager.persist(message).flush();

    this.eventEmitter.emit(
      CHAT_MESSAGE_CREATED_EVENT,
      {
        conversation_id: conversation.id,
        message_id: message.id,
        sender_user_id: conversation.buyerUser.id,
        recipient_user_ids: [conversation.shop.ownerUser.id],
        body: message.body,
        message_type: message.messageType,
        shop_id: conversation.shop.id,
        occurred_at: message.createdAt.toISOString(),
        metadata: message.metadata,
      } satisfies ChatMessageCreatedEventPayload,
    );
  }
}
