import type {
  CartActor,
  CartInventoryCandidate,
  CartSnapshot
} from '../cart.types';

export interface UpdateOwnedCartItemInput {
  actor: CartActor;
  cartId?: string;
  inventoryId: string;
  quantity?: number;
  isSelectOrder?: boolean;
}

export interface DeleteOwnedCartItemInput {
  actor: CartActor;
  cartId?: string;
  inventoryId: string;
}

export abstract class CartRepository {
  abstract findInventoryCandidateById(
    inventoryId: string
  ): Promise<CartInventoryCandidate | null>;

  abstract findCartByIdForActor(
    actor: CartActor,
    cartId: string
  ): Promise<CartSnapshot | null>;

  abstract findActiveCart(actor: CartActor): Promise<CartSnapshot | null>;

  abstract addItemToActiveCart(
    actor: CartActor,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot>;

  abstract createBuyNowCart(
    actor: CartActor,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot>;

  abstract updateCartItem(
    input: UpdateOwnedCartItemInput
  ): Promise<CartSnapshot | null>;

  abstract deleteCartItem(
    input: DeleteOwnedCartItemInput
  ): Promise<CartSnapshot | null>;

  abstract mergeGuestCartIntoUser(
    guestSessionId: string,
    userId: string
  ): Promise<CartSnapshot | null>;
}
