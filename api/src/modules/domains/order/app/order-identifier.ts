export function buildOrderIdentifierWhere(identifier: string) {
  return {
    $or: [
      { id: identifier },
      { orderNumber: identifier },
    ],
  };
}

export function buildScopedOrderIdentifierWhere(
  identifier: string,
  scope: Record<string, unknown>
) {
  return {
    $and: [
      scope,
      buildOrderIdentifierWhere(identifier),
    ],
  };
}
