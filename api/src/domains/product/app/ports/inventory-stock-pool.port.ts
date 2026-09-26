import type { EntityManager } from '@mikro-orm/postgresql';

export interface StockPoolBalance {
  stockPoolId: string;
  onHandQuantity: number;
  reservedQuantity: number;
  onHandVersion: number;
  availableQuantity: number;
  shortage: number;
}

export interface OpenSellerPoolInput {
  inventoryId: string;
  shopId: string;
  onHandQuantity: number;
  commandId?: string;
  actorId?: string;
}

export interface CountSellerPoolInput {
  inventoryId: string;
  onHandQuantity: number;
  expectedOnHandVersion: number;
  commandId?: string;
  actorId?: string;
  note?: string;
}

export abstract class InventoryStockPoolPort {
  abstract openSellerPool(
    entityManager: EntityManager,
    input: OpenSellerPoolInput,
  ): Promise<{ stockPoolId: string }>;

  abstract findSellerPoolId(
    entityManager: EntityManager,
    input: { inventoryId: string },
  ): Promise<string | null>;

  abstract countSellerPool(
    entityManager: EntityManager,
    input: CountSellerPoolInput,
  ): Promise<StockPoolBalance>;
}
