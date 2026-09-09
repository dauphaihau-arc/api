import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  CartQuantityExceedsStockError,
  ProductInventoryNotFoundError,
  ProductUnavailableForCartError,
  type CartAppError,
} from '../../errors/cart-app.error';
import { CartRepository } from '../../ports/cart.repository';
import type { CartActor, CartSnapshot } from '../../cart.types';
import { PurchaseEligibilityService } from '~/domains/product/app/services/purchase-eligibility.service';

export interface AddCartItemInput {
  inventoryId: string;
  quantity: number;
  isTemp?: boolean;
}

@Injectable()
export class AddCartItemUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly purchaseEligibilityService: PurchaseEligibilityService,
  ) {}

  async execute(
    actor: CartActor,
    input: AddCartItemInput,
  ): Promise<Result<CartSnapshot, CartAppError>> {
    const inventory = await this.cartRepository.findInventoryCandidateById(
      input.inventoryId,
    );

    if (!inventory) {
      return err(new ProductInventoryNotFoundError(input.inventoryId));
    }

    const eligibility = await this.purchaseEligibilityService.evaluate({
      items: [{
        inventoryId: input.inventoryId,
        quantity: input.quantity,
        title: inventory.title,
      }],
    });

    if (!eligibility.eligible) {
      const reason = eligibility.failures[0]?.reason;

      return err(reason === 'insufficient_available_quantity'
        ? new CartQuantityExceedsStockError()
        : new ProductUnavailableForCartError());
    }

    const cart = input.isTemp
      ? await this.cartRepository.createBuyNowCart(
        actor,
        input.inventoryId,
        input.quantity,
      )
      : await this.cartRepository.addItemToActiveCart(
        actor,
        input.inventoryId,
        input.quantity,
      );

    return ok(cart);
  }
}
