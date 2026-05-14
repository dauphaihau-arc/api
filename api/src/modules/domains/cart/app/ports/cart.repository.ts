import type {
  CartInventoryCandidate,
  CartSnapshot
} from '../cart.types';

export interface UpdateOwnedCartItemInput {
  userId: string;
  cartId?: string;
  inventoryId: string;
  quantity?: number;
  isSelectOrder?: boolean;
}

export interface DeleteOwnedCartItemInput {
  userId: string;
  cartId?: string;
  inventoryId: string;
}

export abstract class CartRepository {
  abstract findInventoryCandidateById(
    inventoryId: string
  ): Promise<CartInventoryCandidate | null>;

  abstract findOwnedCartById(
    userId: string,
    cartId: string
  ): Promise<CartSnapshot | null>;

  abstract findActiveCartByUserId(userId: string): Promise<CartSnapshot | null>;

  abstract addItemToActiveCart(
    userId: string,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot>;

  abstract createTempCart(
    userId: string,
    inventoryId: string,
    quantity: number
  ): Promise<CartSnapshot>;

  abstract updateOwnedCartItem(
    input: UpdateOwnedCartItemInput
  ): Promise<CartSnapshot | null>;

  abstract deleteOwnedCartItem(
    input: DeleteOwnedCartItemInput
  ): Promise<CartSnapshot | null>;
}
