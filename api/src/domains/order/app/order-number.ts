export function getRequiredOrderNumber(order: {
  id: string;
  orderNumber?: string | null;
}): string {
  if (!order.orderNumber) {
    throw new Error(`Order ${order.id} is missing orderNumber`);
  }

  return order.orderNumber;
}
