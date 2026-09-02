import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ResolvedStorefrontPriceService } from '~/domains/product/app/services/resolved-storefront-price.service';
import { getActiveBasePrice } from '~/domains/product/infra/persistence/mikro-orm/reads/variant-price-read';
import {
  decodeChatMessageCursor,
  encodeChatMessageCursor,
} from '../../../app/chat-message-cursor';
import { getProductReferenceProductId } from '../../../app/chat-product-reference';
import {
  applyProductReferenceDisplayPrices,
  type ChatProductReferenceDisplayPrice,
} from '../../../app/chat-product-reference-pricing';
import {
  toChatConversationSummary,
  toChatMessageSummary,
} from '../../../app/chat-read-model';
import type {
  ChatConversationListQuery,
  ChatConversationListResult,
  ChatMessageListQuery,
  ChatMessageListResult,
} from '../../../app/chat.types';
import { ChatQueryRepository } from '../../../app/ports/chat-query.repository';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';

const CHAT_CONVERSATION_SUMMARY_POPULATE = [
  'buyerUser',
  'shop.ownerUser',
  'lastMessage',
  'lastMessageSenderUser',
] as const;

type ProductReferencePricingMode = 'buyer_presentment' | 'seller_base';

@Injectable()
export class MikroOrmChatQueryRepository implements ChatQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService,
  ) {}

  async listBuyerConversations(
    buyerUserId: string,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    const repository = this.entityManager.fork().getRepository(ChatConversationEntity);

    const [conversations, total] = await repository.findAndCount(
      { buyerUser: buyerUserId },
      {
        populate: CHAT_CONVERSATION_SUMMARY_POPULATE,
        orderBy: {
          lastMessageAt: 'desc',
          createdAt: 'desc',
        },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
    );

    return buildConversationListResult(conversations, total, query);
  }

  async listShopConversations(
    shopId: string,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    const repository = this.entityManager.fork().getRepository(ChatConversationEntity);

    const [conversations, total] = await repository.findAndCount(
      { shop: shopId },
      {
        populate: CHAT_CONVERSATION_SUMMARY_POPULATE,
        orderBy: {
          lastMessageAt: 'desc',
          createdAt: 'desc',
        },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
    );

    return buildConversationListResult(conversations, total, query);
  }

  countBuyerUnreadConversations(buyerUserId: string): Promise<number> {
    return this.entityManager.fork().getRepository(ChatConversationEntity).count({
      buyerUser: buyerUserId,
      buyerUnreadCount: { $gt: 0 },
    });
  }

  countShopUnreadConversations(shopId: string): Promise<number> {
    return this.entityManager.fork().getRepository(ChatConversationEntity).count({
      shop: shopId,
      sellerUnreadCount: { $gt: 0 },
    });
  }

  async conversationExists(conversationId: string): Promise<boolean> {
    const count = await this.entityManager.fork().getRepository(ChatConversationEntity).count({
      id: conversationId,
    });

    return count > 0;
  }

  async listBuyerMessages(
    buyerUserId: string,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult | null> {
    const entityManager = this.entityManager.fork();

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, buyerUser: buyerUserId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return null;
    }

    return this.listConversationMessages(entityManager, conversation, query, 'buyer_presentment');
  }

  async listShopMessages(
    shopId: string,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult | null> {
    const entityManager = this.entityManager.fork();

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return null;
    }

    return this.listConversationMessages(entityManager, conversation, query, 'seller_base');
  }

  private async listConversationMessages(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    query: ChatMessageListQuery,
    pricingMode: ProductReferencePricingMode,
  ): Promise<ChatMessageListResult> {
    const cursor = query.before ? decodeChatMessageCursor(query.before) : undefined;

    const filters = cursor
      ? {
        conversation: conversation.id,
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { $lt: cursor.id },
          },
        ],
      }
      : { conversation: conversation.id };

    const messages = await entityManager.getRepository(ChatMessageEntity).find(
      filters,
      {
        populate: ['conversation', 'senderUser'],
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: query.limit + 1,
      },
    );

    const hasMoreBefore = messages.length > query.limit;
    const pageMessages = messages.slice(0, query.limit).reverse();
    const oldestMessage = pageMessages[0];

    return {
      conversation: toChatConversationSummary(conversation),
      results: await this.toMessageSummaries(entityManager, pageMessages, pricingMode),
      limit: query.limit,
      pageInfo: {
        hasMoreBefore,
        beforeCursor: hasMoreBefore && oldestMessage
          ? encodeChatMessageCursor({
            createdAt: oldestMessage.createdAt,
            id: oldestMessage.id,
          })
          : undefined,
      },
    };
  }

  private async toMessageSummaries(
    entityManager: EntityManager,
    messages: ChatMessageEntity[],
    pricingMode: ProductReferencePricingMode,
  ) {
    const summaries = messages.map(toChatMessageSummary);

    const productIds = [
      ...new Set(
        summaries
          .map((message) => getProductReferenceProductId(message.metadata))
          .filter((productId): productId is string => productId != null),
      ),
    ];

    if (productIds.length === 0) {
      return summaries;
    }

    const products = await entityManager.getRepository(ProductEntity).find(
      { id: { $in: productIds } },
      { populate: ['inventoryRecords.prices'] },
    );
    const displayPrices = await this.resolveProductReferenceDisplayPrices(products, pricingMode);

    return applyProductReferenceDisplayPrices(summaries, displayPrices);
  }

  private async resolveProductReferenceDisplayPrices(
    products: ProductEntity[],
    pricingMode: ProductReferencePricingMode,
  ): Promise<Map<string, ChatProductReferenceDisplayPrice>> {

    const pricingByInventoryId = pricingMode === 'buyer_presentment'
      ? await this.resolvedStorefrontPriceService.resolveManyForCurrentRequest(
        products.flatMap((product) => product.inventoryRecords.getItems()),
      )
      : undefined;

    const priceByProductId = new Map<string, ChatProductReferenceDisplayPrice>();

    for (const product of products) {
      const prices = product.inventoryRecords
        .getItems()
        .map((inventory) => {
          if (pricingByInventoryId) {
            return pricingByInventoryId.get(inventory.id);
          }

          const basePrice = getActiveBasePrice(inventory);

          return basePrice
            ? {
              amountMinor: basePrice.amountMinor,
              currency: basePrice.currency,
            }
            : undefined;
        })
        .filter((price): price is NonNullable<typeof price> => price != null && price.amountMinor != null)
        .sort((left, right) => left.amountMinor - right.amountMinor);

      const lowestPrice = prices[0];

      if (!lowestPrice) {
        continue;
      }

      priceByProductId.set(product.id, {
        productId: product.id,
        amountMinor: lowestPrice.amountMinor,
        currency: lowestPrice.currency,
      });
    }

    return priceByProductId;
  }
}

function buildConversationListResult(
  conversations: ChatConversationEntity[],
  total: number,
  query: ChatConversationListQuery,
): ChatConversationListResult {
  return {
    results: conversations.map(toChatConversationSummary),
    page: query.page,
    limit: query.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    totalResults: total,
  };
}
