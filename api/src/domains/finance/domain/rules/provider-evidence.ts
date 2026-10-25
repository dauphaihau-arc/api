/**
 * What a provider transfer webhook reported. The provider emits `created` when
 * the platform transfer is accepted, `updated` when it changes, and `reversed`
 * when money moved back; each event is stored as its own evidence row.
 */
export type ProviderTransferEventStatus = 'created' | 'updated' | 'reversed';

/**
 * The final state of a connected account's bank payout. Stripe only reports a
 * terminal outcome, so there is no `pending` evidence to store.
 */
export type ConnectedPayoutStatus = 'paid' | 'failed';
