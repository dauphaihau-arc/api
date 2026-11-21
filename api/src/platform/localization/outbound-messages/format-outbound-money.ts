/** Formats a major-unit amount for an outbound message without converting it. */
export function formatOutboundMoney(
  language: string,
  amount: number,
  currency: string,
): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency,
  }).format(amount);
}
