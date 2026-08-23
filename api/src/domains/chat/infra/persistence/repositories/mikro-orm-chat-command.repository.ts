import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { buildChatMessageBodyPreview } from '../../../app/chat-message-preview';
import {
  CHAT_MESSAGE_TYPES,
  buildChatProductReferenceMetadata,
} from '../../../app/chat-product-reference';
import {
  toChatConversationSummary,
  toChatMessageSummary,
} from '../../../app/chat-read-model';
import type {
  ChatConversationSummary,
  ChatMessageSummary,
} from '../../../app/chat.types';
import {
  ChatCommandRepository,
  type MarkBuyerChatConversationReadResult,
} from '../../../app/ports/chat-command.repository';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';

const CHAT_CONVERSATION_SUMMARY_POPULATE = [
  'buyerUser',
  'shop.ownerUser',
  'lastMessage',
  'lastMessageSenderUser',
] as const;

@Injectable()
export class MikroOrmChatCommandRepository implements ChatCommandRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  loadShopForConversationStart(
    entityManager: EntityManager,
    shopId: string,
  ): Promise<ShopEntity | null> {
    return entityManager.getRepository(ShopEntity).findOne(
      { id: shopId },
      { populate: ['ownerUser'] },
    );
  }

  loadProductForConversationReference(
    entityManager: EntityManager,
    productId: string,
  ): Promise<ProductEntity | null> {
    return entityManager.getRepository(ProductEntity).findOne(
      { id: productId },
      {
        populate: [
          'shop',
          'images.variants',
          'inventoryRecords.prices',
        ],
      },
    );
  }

  loadBuyerShopConversationForStart(
    entityManager: EntityManager,
    buyerUserId: string,
    shopId: string,
  ): Promise<ChatConversationEntity | null> {
    return entityManager.getRepository(ChatConversationEntity).findOne(
      {
        buyerUser: buyerUserId,
        shop: shopId,
      },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );
  }

  createBuyerShopConversation(
    entityManager: EntityManager,
    buyerUserId: string,
    shop: ShopEntity,
  ): ChatConversationEntity {
    const conversation = new ChatConversationEntity();
    conversation.buyerUser = entityManager.getReference(CurrentUserEntity, buyerUserId);
    conversation.shop = shop;
    entityManager.persist(conversation);

    return conversation;
  }

  loadProductReferenceMessagesForConversation(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
  ): Promise<ChatMessageEntity[]> {
    return entityManager.getRepository(ChatMessageEntity).find({
      conversation,
      messageType: CHAT_MESSAGE_TYPES.PRODUCT_REFERENCE,
    });
  }

  addProductReferenceMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    product: ProductEntity,
  ): ChatMessageEntity {
    const message = new ChatMessageEntity();
    message.conversation = conversation;
    message.senderUser = conversation.buyerUser;
    message.messageType = CHAT_MESSAGE_TYPES.PRODUCT_REFERENCE;
    message.body = product.title;
    message.metadata = buildChatProductReferenceMetadata(
      product,
      storageKey => this.storageService.getPublicUrl(storageKey),
    );

    applyLastBuyerMessage(conversation, message);
    entityManager.persist(message);

    return message;
  }

  loadConversationForBuyerMessage(
    entityManager: EntityManager,
    conversationId: string,
  ): Promise<ChatConversationEntity | null> {
    return entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId },
      { populate: ['buyerUser', 'shop.ownerUser'] },
    );
  }

  loadConversationForShopMessage(
    entityManager: EntityManager,
    shopId: string,
    conversationId: string,
  ): Promise<ChatConversationEntity | null> {
    return entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: ['buyerUser', 'shop.ownerUser'] },
    );
  }

  addBuyerMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    input: {
      senderUserId: string;
      body: string;
      metadata?: Record<string, unknown>;
    },
  ): ChatMessageEntity {
    const message = buildTextMessage(entityManager, conversation, input);
    applyLastBuyerMessage(conversation, message);
    entityManager.persist(message);

    return message;
  }

  addShopMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    input: {
      senderUserId: string;
      body: string;
      metadata?: Record<string, unknown>;
    },
  ): ChatMessageEntity {
    const message = buildTextMessage(entityManager, conversation, input);
    applyLastShopMessage(conversation, message);
    entityManager.persist(message);

    return message;
  }

  async populateConversationSummary(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
  ): Promise<ChatConversationSummary> {
    await entityManager.populate(conversation, CHAT_CONVERSATION_SUMMARY_POPULATE);
    return toChatConversationSummary(conversation);
  }

  async populateMessageSummary(
    entityManager: EntityManager,
    message: ChatMessageEntity,
  ): Promise<ChatMessageSummary> {
    await entityManager.populate(message, ['conversation', 'senderUser']);
    return toChatMessageSummary(message);
  }

  async markBuyerConversationRead(
    buyerUserId: string,
    conversationId: string,
  ): Promise<MarkBuyerChatConversationReadResult> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return { status: 'not_found' };
    }

    if (conversation.buyerUser.id !== buyerUserId) {
      return { status: 'access_denied' };
    }

    conversation.buyerLastReadAt = new Date();
    conversation.buyerUnreadCount = 0;
    await entityManager.flush();

    return {
      status: 'ok',
      conversation: toChatConversationSummary(conversation),
    };
  }

  async markShopConversationRead(
    shopId: string,
    conversationId: string,
  ): Promise<ChatConversationSummary | null> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return null;
    }

    conversation.sellerLastReadAt = new Date();
    conversation.sellerUnreadCount = 0;
    await entityManager.flush();

    return toChatConversationSummary(conversation);
  }
}

function buildTextMessage(
  entityManager: EntityManager,
  conversation: ChatConversationEntity,
  input: {
    senderUserId: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
): ChatMessageEntity {
  const message = new ChatMessageEntity();
  message.conversation = conversation;
  message.senderUser = entityManager.getReference(CurrentUserEntity, input.senderUserId);
  message.body = input.body.trim();

  if (input.metadata) {
    message.metadata = input.metadata;
  }

  return message;
}

function applyLastBuyerMessage(
  conversation: ChatConversationEntity,
  message: ChatMessageEntity,
): void {
  applyLastMessage(conversation, message);
  conversation.buyerLastReadAt = message.createdAt;
  conversation.buyerUnreadCount = 0;
  conversation.sellerUnreadCount += 1;
}

function applyLastShopMessage(
  conversation: ChatConversationEntity,
  message: ChatMessageEntity,
): void {
  applyLastMessage(conversation, message);
  conversation.sellerLastReadAt = message.createdAt;
  conversation.sellerUnreadCount = 0;
  conversation.buyerUnreadCount += 1;
}

function applyLastMessage(
  conversation: ChatConversationEntity,
  message: ChatMessageEntity,
): void {
  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessageSenderUser = message.senderUser;
  conversation.lastMessage = message;
  conversation.lastMessageBodyPreview = buildChatMessageBodyPreview(message.body);
  conversation.lastMessageType = message.messageType;
}
