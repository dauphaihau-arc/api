function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildOrderIdentifierWhere(identifier: string) {
  if (isUuid(identifier)) {
    return {
      $or: [
        { id: identifier },
        { orderNumber: identifier },
      ],
    };
  }

  return {
    orderNumber: identifier,
  };
}

export function buildScopedOrderIdentifierWhere(
  identifier: string,
  scope: Record<string, unknown>,
) {
  return {
    $and: [
      scope,
      buildOrderIdentifierWhere(identifier),
    ],
  };
}
