import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductLookupService } from '~/domains/product/app/services/product-lookup.service';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { ChatConversationNotFoundError, ChatProductNotFoundError, ChatShopNotFoundError } from '../errors/chat-app.error';
import { ChatQueryRepository } from '../ports/chat-query.repository';

/**
 * Resolves the shop and conversation a chat route acts on. Each conversation
 * lookup is scoped to its owner so an unscoped public id can never reach a use
 * case, and the manageable-shop call authorizes the actor.
 */
@Injectable()
export class ChatPublicReferenceService {
  constructor(
    private readonly chatQueryRepository: ChatQueryRepository,
    private readonly shopAccessService: ShopAccessService,
    private readonly productLookupService: ProductLookupService,
  ) {}

  async resolveBuyerConversationId(
    actor: AuthenticatedUser,
    conversationPublicId: string,
  ): Promise<string> {
    const conversationId = await this.chatQueryRepository.findIdByPublicIdAndBuyer(
      conversationPublicId,
      actor.userId,
    );

    if (!conversationId) throw new ChatConversationNotFoundError();

    return conversationId;
  }

  async resolveManageableConversationId(
    actor: AuthenticatedUser,
    shopPublicId: string,
    conversationPublicId: string,
  ): Promise<{ shopId: string; conversationId: string }> {
    const shopId = await this.resolveManageableShop(actor, shopPublicId);
    const conversationId = await this.chatQueryRepository.findIdByPublicIdAndShop(
      conversationPublicId,
      shopId,
    );

    if (!conversationId) throw new ChatConversationNotFoundError();

    return { shopId, conversationId };
  }

  async resolveBuyerReferences(shopPublicId: string, productPublicId?: string): Promise<{ shopId: string; productId?: string }> {
    const [shopId] = await this.shopAccessService.resolveShopPublicIds([shopPublicId]);
    if (!shopId) throw new ChatShopNotFoundError();
    if (!productPublicId) return { shopId };
    const [productId] = await this.productLookupService.resolveProductPublicIds([productPublicId]);
    if (!productId) throw new ChatProductNotFoundError();
    return { shopId, productId };
  }

  async resolveManageableShop(actor: AuthenticatedUser, shopPublicId: string): Promise<string> {
    const shop = await this.shopAccessService.resolveManageableShopByPublicId(actor, shopPublicId);
    return shop.id;
  }
}
