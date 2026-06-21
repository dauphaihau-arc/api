import type { CartSnapshot } from '../../cart/app/cart.types';
import type { LoadedCheckoutQuote } from './load-checkout-quote.service';

export function doesCartMatchCheckoutQuote(
  cart: CartSnapshot,
  quote: LoadedCheckoutQuote,
): boolean {
  const selectedEntries = cart.items
    .filter((item) => item.isSelectOrder)
    .map((item) => ({
      inventoryId: item.inventory.inventoryId,
      quantity: item.quantity,
    }))
    .sort(compareSelectionEntry);

  const quotedEntries = quote.items
    .map((item) => ({
      inventoryId: item.inventoryId,
      quantity: item.quantity,
    }))
    .sort(compareSelectionEntry);

  if (selectedEntries.length !== quotedEntries.length) {
    return false;
  }

  return selectedEntries.every((entry, index) =>
    entry.inventoryId === quotedEntries[index]?.inventoryId
    && entry.quantity === quotedEntries[index]?.quantity,
  );
}

function compareSelectionEntry(
  left: { inventoryId: string; quantity: number },
  right: { inventoryId: string; quantity: number },
): number {
  return left.inventoryId.localeCompare(right.inventoryId)
    || left.quantity - right.quantity;
}
