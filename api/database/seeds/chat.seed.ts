import type { EntityManager } from '@mikro-orm/postgresql';
import type { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import {
  CHAT_CONVERSATIONS_LOCAL_TSV_PATH,
  CHAT_CONVERSATIONS_TSV_PATH,
  CHAT_MESSAGES_LOCAL_TSV_PATH,
  CHAT_MESSAGES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';
import { ChatConversationEntity } from '../../src/modules/domains/chat/infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '../../src/modules/domains/chat/infra/persistence/entities/chat-message.entity';

type ConversationSeed = {
  conversationKey: string;
  buyerEmail: string;
  shopSlug: string;
  productTitle?: string;
  status: string;
  buyerLastReadAt?: Date;
  sellerLastReadAt?: Date;
  createdAt: Date;
};

type MessageSeed = {
  conversationKey: string;
  senderEmail: string;
  body: string;
  messageType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  editedAt?: Date;
};

type ConversationCsvRow = {
  conversation_key: string;
  buyer_email: string;
  shop_slug: string;
  product_title: string;
  status: string;
  buyer_last_read_at: string;
  seller_last_read_at: string;
  created_at: string;
};

type MessageCsvRow = {
  conversation_key: string;
  sender_email: string;
  body: string;
  message_type: string;
  metadata_json: string;
  created_at: string;
  edited_at: string;
};

function parseRequiredDate(value: string, fieldName: string, seedKey: string): Date {
  const parsed = new Date(value.trim());

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName} "${value}" for chat seed ${seedKey}`);
  }

  return parsed;
}

function parseOptionalDate(
  value: string,
  fieldName: string,
  seedKey: string,
): Date | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return parseRequiredDate(normalized, fieldName, seedKey);
}

function parseMetadata(
  value: string,
  fieldName: string,
  seedKey: string,
): Record<string, unknown> | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized);
  }
  catch (error) {
    throw new Error(
      `Invalid ${fieldName} JSON for chat seed ${seedKey}: ${error instanceof Error ? error.message : 'Unknown JSON parse error'}`,
    );
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`Expected ${fieldName} JSON object for chat seed ${seedKey}`);
  }

  return parsed as Record<string, unknown>;
}

function loadConversationSeeds(): ConversationSeed[] {
  return [
    ...readTsvRows<ConversationCsvRow>(CHAT_CONVERSATIONS_TSV_PATH),
    ...readOptionalTsvRows<ConversationCsvRow>(CHAT_CONVERSATIONS_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const seedKey = `${row.conversation_key || `row-${index + 2}`}`;

    if (!row.conversation_key.trim()) {
      throw new Error(`Missing conversation_key for chat conversation seed row ${index + 2}`);
    }

    if (!row.buyer_email.trim()) {
      throw new Error(`Missing buyer_email for chat conversation seed ${seedKey}`);
    }

    if (!row.shop_slug.trim()) {
      throw new Error(`Missing shop_slug for chat conversation seed ${seedKey}`);
    }

    return {
      conversationKey: row.conversation_key.trim(),
      buyerEmail: row.buyer_email.trim(),
      shopSlug: row.shop_slug.trim(),
      productTitle: row.product_title.trim() || undefined,
      status: row.status.trim() || 'open',
      buyerLastReadAt: parseOptionalDate(row.buyer_last_read_at, 'buyer_last_read_at', seedKey),
      sellerLastReadAt: parseOptionalDate(
        row.seller_last_read_at,
        'seller_last_read_at',
        seedKey,
      ),
      createdAt: parseRequiredDate(row.created_at, 'created_at', seedKey),
    };
  });
}

function loadMessageSeeds(): MessageSeed[] {
  return [
    ...readTsvRows<MessageCsvRow>(CHAT_MESSAGES_TSV_PATH),
    ...readOptionalTsvRows<MessageCsvRow>(CHAT_MESSAGES_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const seedKey = `${row.conversation_key || `row-${index + 2}`}`;

    if (!row.conversation_key.trim()) {
      throw new Error(`Missing conversation_key for chat message seed row ${index + 2}`);
    }

    if (!row.sender_email.trim()) {
      throw new Error(`Missing sender_email for chat message seed ${seedKey}`);
    }

    if (!row.body.trim()) {
      throw new Error(`Missing body for chat message seed ${seedKey}`);
    }

    return {
      conversationKey: row.conversation_key.trim(),
      senderEmail: row.sender_email.trim(),
      body: row.body.trim(),
      messageType: row.message_type.trim() || 'text',
      metadata: parseMetadata(row.metadata_json, 'metadata_json', seedKey),
      createdAt: parseRequiredDate(row.created_at, 'created_at', seedKey),
      editedAt: parseOptionalDate(row.edited_at, 'edited_at', seedKey),
    };
  });
}

const conversationSeeds = loadConversationSeeds();
const messageSeeds = loadMessageSeeds();

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

export async function seedChat(
  em: EntityManager,
  usersByEmail: Map<string, CurrentUserEntity>,
): Promise<void> {
  const progressInterval = resolveProgressInterval(conversationSeeds.length);
  const startedAt = Date.now();
  const messagesByConversationKey = new Map<string, MessageSeed[]>();

  messageSeeds.forEach((seed) => {
    const messages = messagesByConversationKey.get(seed.conversationKey) ?? [];
    messages.push(seed);
    messagesByConversationKey.set(seed.conversationKey, messages);
  });

  console.log(
    `[seed][chat] Upserting ${conversationSeeds.length} conversations with ${messageSeeds.length} messages`,
  );

  for (const [index, conversationSeed] of conversationSeeds.entries()) {
    const buyer = usersByEmail.get(conversationSeed.buyerEmail);

    if (!buyer) {
      throw new Error(`Missing seeded buyer user: ${conversationSeed.buyerEmail}`);
    }

    const shop = await em.findOne(ShopEntity, { slug: conversationSeed.shopSlug }, {
      populate: ['ownerUser'],
    });

    if (!shop) {
      throw new Error(`Missing seeded shop: ${conversationSeed.shopSlug}`);
    }

    let product: ProductEntity | null = null;

    if (conversationSeed.productTitle) {
      product = await em.findOne(ProductEntity, {
        shop,
        title: conversationSeed.productTitle,
      });

      if (!product) {
        throw new Error(
          `Missing seeded product "${conversationSeed.productTitle}" for shop "${conversationSeed.shopSlug}"`,
        );
      }
    }

    const conversationMessages = (messagesByConversationKey.get(conversationSeed.conversationKey) ?? [])
      .slice()
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    if (conversationMessages.length === 0) {
      throw new Error(`Missing chat messages for conversation ${conversationSeed.conversationKey}`);
    }

    const existingConversation = await em.findOne(
      ChatConversationEntity,
      {
        buyerUser: buyer,
        shop,
        product: product?.id ?? null,
      },
      { populate: ['messages'] },
    );

    const conversation = existingConversation ?? em.create(ChatConversationEntity, {
      buyerUser: buyer,
      shop,
      status: conversationSeed.status,
    });

    if (existingConversation) {
      const existingMessages = await em.find(ChatMessageEntity, { conversation });
      existingMessages.forEach((message) => em.remove(message));
      await em.flush();
    }

    conversation.buyerUser = buyer;
    conversation.shop = shop;
    conversation.product = product ?? undefined;
    conversation.status = conversationSeed.status;
    conversation.createdAt = conversationSeed.createdAt;
    conversation.updatedAt = conversationSeed.createdAt;
    conversation.buyerLastReadAt = conversationSeed.buyerLastReadAt;
    conversation.sellerLastReadAt = conversationSeed.sellerLastReadAt;
    conversation.lastMessageAt = undefined;
    conversation.lastMessageSenderUser = undefined;
    em.persist(conversation);
    await em.flush();

    let lastMessage: ChatMessageEntity | undefined;

    for (const messageSeed of conversationMessages) {
      const sender = usersByEmail.get(messageSeed.senderEmail);

      if (!sender) {
        throw new Error(`Missing seeded message sender user: ${messageSeed.senderEmail}`);
      }

      const message = em.create(ChatMessageEntity, {
        conversation,
        senderUser: sender,
        body: messageSeed.body,
        messageType: messageSeed.messageType,
        metadata: messageSeed.metadata,
        editedAt: messageSeed.editedAt,
      });

      message.createdAt = messageSeed.createdAt;
      message.updatedAt = messageSeed.editedAt ?? messageSeed.createdAt;
      em.persist(message);
      lastMessage = message;
    }

    if (lastMessage) {
      conversation.lastMessageAt = lastMessage.createdAt;
      conversation.lastMessageSenderUser = lastMessage.senderUser;
      conversation.updatedAt = lastMessage.updatedAt;
    }

    em.persist(conversation);
    await em.flush();

    if (
      (index + 1) % progressInterval === 0
      || index + 1 === conversationSeeds.length
    ) {
      console.log(
        `[seed][chat] Processed ${index + 1}/${conversationSeeds.length} conversations in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }
}
