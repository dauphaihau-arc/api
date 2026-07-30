import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CurrentUserEntity } from '~/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { toChatConversationSummary } from '../../chat-read-model';
import type { ChatConversationSummary } from '../../chat.types';
import {
  ChatProductNotFoundError,
  ChatProductShopMismatchError,
  ChatShopNotFoundError,
} from '../../errors/chat-app.error';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';

@Injectable()
export class CreateOrGetMyChatConversationUseCase {
  constructor(private readonly entityManager: EntityManager) {}

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
      product = await entityManager.getRepository(ProductEntity).findOne({
        id: input.productId,
      });

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
        product: product?.id ?? null,
      },
      { populate: ['buyerUser', 'shop.ownerUser', 'product'] },
    );

    if (conversation) {
      return toChatConversationSummary(conversation);
    }

    const createdConversation = new ChatConversationEntity();
    createdConversation.buyerUser = entityManager.getReference(CurrentUserEntity, actor.userId);
    createdConversation.shop = shop;

    if (product) {
      createdConversation.product = product;
    }

    await entityManager.persistAndFlush(createdConversation);
    await entityManager.populate(createdConversation, ['buyerUser', 'shop.ownerUser', 'product']);

    return toChatConversationSummary(createdConversation);
  }
}
