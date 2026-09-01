import type { EntityManager } from '@mikro-orm/postgresql';
import type { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import {
  CHAT_CONVERSATIONS_LOCAL_TSV_PATH,
  CHAT_CONVERSATIONS_TSV_PATH,
  CHAT_MESSAGES_LOCAL_TSV_PATH,
  CHAT_MESSAGES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';
import { ChatConversationEntity } from '~/domains/chat/infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '~/domains/chat/infra/persistence/entities/chat-message.entity';
import { buildChatMessageBodyPreview } from '~/domains/chat/app/chat-message-preview';
import {
  buildChatProductReferenceMetadata,
  CHAT_MESSAGE_TYPES,
} from '~/domains/chat/app/chat-product-reference';

type ConversationSeed = {
  conversationKey: string;
  buyerEmail: string;
  shopSlug: string;
  productTitle?: string;
  status: string;
  buyerLastReadAt?: Date;
  sellerLastReadAt?: Date;
  createdAt: Date;
  isLocal: boolean;
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

function mapConversationRows(
  rows: ConversationCsvRow[],
  isLocal: boolean,
): ConversationSeed[] {
  return rows.map((row, index) => {
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
      isLocal,
    };
  });
}

function loadConversationSeeds(): ConversationSeed[] {
  return [
    ...mapConversationRows(readTsvRows<ConversationCsvRow>(CHAT_CONVERSATIONS_TSV_PATH), false),
    ...mapConversationRows(
      readOptionalTsvRows<ConversationCsvRow>(CHAT_CONVERSATIONS_LOCAL_TSV_PATH),
      true,
    ),
  ];
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
  usersByEmail: Map<string, UserEntity>,
): Promise<void> {
  const progressInterval = resolveProgressInterval(conversationSeeds.length);
  const startedAt = Date.now();
  const messagesByConversationKey = new Map<string, MessageSeed[]>();
  let skippedLocalConversations = 0;
  let seededMessageCount = 0;

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
      if (conversationSeed.isLocal) {
        skippedLocalConversations += 1;
        console.warn(
          `[seed][chat] Skipping local conversation ${conversationSeed.conversationKey}: missing shop "${conversationSeed.shopSlug}"`,
        );
        continue;
      }
      throw new Error(`Missing seeded shop: ${conversationSeed.shopSlug}`);
    }

    let product: ProductEntity | null = null;

    if (conversationSeed.productTitle) {
      product = await em.findOne(ProductEntity, {
        shop,
        title: conversationSeed.productTitle,
      }, {
        populate: [
          'shop',
          'images.variants',
          'inventoryRecords.prices',
        ],
      });

      if (!product) {
        if (conversationSeed.isLocal) {
          skippedLocalConversations += 1;
          console.warn(
            `[seed][chat] Skipping local conversation ${conversationSeed.conversationKey}: missing product "${conversationSeed.productTitle}" for shop "${conversationSeed.shopSlug}"`,
          );
          continue;
        }
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
      },
      { populate: ['messages'] },
    );

    const conversation = existingConversation ?? em.create(ChatConversationEntity, {
      buyerUser: buyer,
      shop,
      status: conversationSeed.status,
      buyerUnreadCount: 0,
      sellerUnreadCount: 0,
    });

    if (existingConversation) {
      const existingMessages = await em.find(ChatMessageEntity, { conversation });
      existingMessages.forEach((message) => em.remove(message));
      await em.flush();
    }

    conversation.buyerUser = buyer;
    conversation.shop = shop;
    conversation.status = conversationSeed.status;
    conversation.createdAt = conversationSeed.createdAt;
    conversation.updatedAt = conversationSeed.createdAt;
    conversation.buyerLastReadAt = conversationSeed.buyerLastReadAt;
    conversation.sellerLastReadAt = conversationSeed.sellerLastReadAt;
    conversation.lastMessageAt = undefined;
    conversation.lastMessageSenderUser = undefined;
    conversation.lastMessage = undefined;
    conversation.lastMessageBodyPreview = undefined;
    conversation.lastMessageType = undefined;
    conversation.buyerUnreadCount = 0;
    conversation.sellerUnreadCount = 0;
    em.persist(conversation);
    await em.flush();

    let lastMessage: ChatMessageEntity | undefined;

    if (product) {
      const productReferenceMessage = em.create(ChatMessageEntity, {
        conversation,
        senderUser: buyer,
        body: product.title,
        messageType: CHAT_MESSAGE_TYPES.PRODUCT_REFERENCE,
        metadata: buildChatProductReferenceMetadata(product, storageKey => `/assetHost/${storageKey}`),
      });

      productReferenceMessage.createdAt = new Date(conversationSeed.createdAt.getTime() - 1);
      productReferenceMessage.updatedAt = productReferenceMessage.createdAt;
      em.persist(productReferenceMessage);
      lastMessage = productReferenceMessage;
      seededMessageCount += 1;
    }

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
      seededMessageCount += 1;
    }

    if (lastMessage) {
      conversation.lastMessageAt = lastMessage.createdAt;
      conversation.lastMessageSenderUser = lastMessage.senderUser;
      conversation.lastMessage = lastMessage;
      conversation.lastMessageBodyPreview = buildChatMessageBodyPreview(lastMessage.body);
      conversation.lastMessageType = lastMessage.messageType;
      conversation.buyerUnreadCount = conversationMessages.filter(messageSeed =>
        messageSeed.senderEmail !== buyer.email
        && (
          !conversation.buyerLastReadAt
          || conversation.buyerLastReadAt < messageSeed.createdAt
        ),
      ).length;
      conversation.sellerUnreadCount = conversationMessages.filter(messageSeed =>
        messageSeed.senderEmail !== shop.ownerUser.email
        && (
          !conversation.sellerLastReadAt
          || conversation.sellerLastReadAt < messageSeed.createdAt
        ),
      ).length;
      conversation.updatedAt = lastMessage.updatedAt;
    }

    em.persist(conversation);
    await em.flush();

    if (
      (index + 1) % progressInterval === 0
      && index + 1 !== conversationSeeds.length
    ) {
      console.log(
        `[seed][chat] Processed ${index + 1}/${conversationSeeds.length} conversations and ${seededMessageCount}/${messageSeeds.length} messages in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  console.log(
    `[seed][chat] Processed ${conversationSeeds.length}/${conversationSeeds.length} conversations and ${seededMessageCount}/${messageSeeds.length} messages in ${formatDuration(Date.now() - startedAt)}`,
  );

  if (skippedLocalConversations > 0) {
    console.log(
      `[seed][chat] Skipped ${skippedLocalConversations} local conversation(s) with unresolved shop/product references`,
    );
  }
}
