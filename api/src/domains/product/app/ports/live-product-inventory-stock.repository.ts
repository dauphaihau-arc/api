export abstract class LiveProductInventoryStockRepository {
  abstract findStockByInventoryIds(inventoryIds: string[]): Promise<Map<string, number>>;
}
