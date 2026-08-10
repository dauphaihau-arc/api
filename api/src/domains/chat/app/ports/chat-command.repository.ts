import type { EntityManager } from '@mikro-orm/postgresql';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import type {
  ChatConversationSummary,
  ChatMessageSummary,
} from '../chat.types';
import type { ChatConversationEntity } from '../../infra/persistence/entities/chat-conversation.entity';
import type { ChatMessageEntity } from '../../infra/persistence/entities/chat-message.entity';

export type MarkBuyerChatConversationReadResult =
  | { status: 'not_found' }
  | { status: 'access_denied' }
  | { status: 'ok'; conversation: ChatConversationSummary };

export abstract class ChatCommandRepository {
  abstract loadShopForConversationStart(
    entityManager: EntityManager,
    shopId: string
  ): Promise<ShopEntity | null>;

  abstract loadProductForConversationReference(
    entityManager: EntityManager,
    productId: string
  ): Promise<ProductEntity | null>;

  abstract loadBuyerShopConversationForStart(
    entityManager: EntityManager,
    buyerUserId: string,
    shopId: string
  ): Promise<ChatConversationEntity | null>;

  abstract createBuyerShopConversation(
    entityManager: EntityManager,
    buyerUserId: string,
    shop: ShopEntity
  ): ChatConversationEntity;

  abstract loadProductReferenceMessagesForConversation(
    entityManager: EntityManager,
    conversation: ChatConversationEntity
  ): Promise<ChatMessageEntity[]>;

  abstract addProductReferenceMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    product: ProductEntity
  ): ChatMessageEntity;

  abstract loadConversationForBuyerMessage(
    entityManager: EntityManager,
    conversationId: string
  ): Promise<ChatConversationEntity | null>;

  abstract loadConversationForShopMessage(
    entityManager: EntityManager,
    shopId: string,
    conversationId: string
  ): Promise<ChatConversationEntity | null>;

  abstract addBuyerMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    input: {
      senderUserId: string;
      body: string;
      metadata?: Record<string, unknown>;
    }
  ): ChatMessageEntity;

  abstract addShopMessage(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    input: {
      senderUserId: string;
      body: string;
      metadata?: Record<string, unknown>;
    }
  ): ChatMessageEntity;

  abstract populateConversationSummary(
    entityManager: EntityManager,
    conversation: ChatConversationEntity
  ): Promise<ChatConversationSummary>;

  abstract populateMessageSummary(
    entityManager: EntityManager,
    message: ChatMessageEntity
  ): Promise<ChatMessageSummary>;

  abstract markBuyerConversationRead(
    buyerUserId: string,
    conversationId: string
  ): Promise<MarkBuyerChatConversationReadResult>;

  abstract markShopConversationRead(
    shopId: string,
    conversationId: string
  ): Promise<ChatConversationSummary | null>;
}
