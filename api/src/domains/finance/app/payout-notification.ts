import type { NotifyUserInput } from '~/domains/notification/app/notification.types';
import { fromMinorUnits } from '~/platform/money/money';
import type { PayoutNotificationFacts } from './ports/payout.types';

/** A Payout outcome as the seller hears about it: terminal success or failure. */
export type PayoutNotificationOutcome = 'succeeded' | 'failed';

const SOURCE_LABELS: Record<PayoutNotificationFacts['source'], string> = {
  scheduled: 'scheduled payout',
  manual: 'manual withdrawal',
};

/**
 * The seller-facing in-app notification for a terminal Payout outcome. It names
 * the source and the amount once, when the Payout is settled either way; a retry
 * never produces one.
 */
export function buildSellerPayoutNotification(
  facts: PayoutNotificationFacts,
  outcome: PayoutNotificationOutcome,
): NotifyUserInput {
  const amount = `${fromMinorUnits(facts.payoutAmountMinor, facts.currency)} ${facts.currency}`;
  const source = SOURCE_LABELS[facts.source];

  return {
    userId: facts.recipientUserId as string,
    type: `seller.payout.${outcome}`,
    title: outcome === 'succeeded' ? 'Payout completed' : 'Payout failed',
    body: outcome === 'succeeded'
      ? `Your ${source} ${facts.payoutNumber} for ${amount} has been sent.`
      : `Your ${source} ${facts.payoutNumber} for ${amount} failed: ${facts.reason ?? 'provider declined the transfer'}.`,
    data: {
      target: 'seller_payouts',
      payoutId: facts.payoutPublicId,
      payoutNumber: facts.payoutNumber,
      amountMinor: facts.payoutAmountMinor,
      currency: facts.currency,
      source: facts.source,
      status: outcome,
    },
    channels: ['in_app'],
  };
}
