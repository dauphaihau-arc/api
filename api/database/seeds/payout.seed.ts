import { randomBytes } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { LedgerAccountKind } from '~/domains/finance/domain/enums/ledger-account-kind.enum';
import {
  calculateCommissionMinor,
  resolveEffectiveSchedule,
} from '~/domains/finance/domain/rules/commission-schedule';
import {
  buildPaidOrderPostings,
  paidOrderMoneyEventKey,
} from '~/domains/finance/domain/rules/paid-order-postings';
import {
  buildPaidPayoutPostings,
  paidPayoutMoneyEventKey,
  payoutRunDay,
} from '~/domains/finance/domain/rules/payout';
import { MANUAL_BANK_PROVIDER } from '~/domains/finance/domain/rules/payout-account';
import { assertBalancedJournalEntry } from '~/domains/finance/domain/value-objects/journal-entry';
import { MikroOrmCommissionScheduleRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-commission-schedule.repository';
import { MikroOrmJournalEntryRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmPayoutAccountRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-payout-account.repository';
import { MikroOrmPayoutAvailabilityRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-payout-availability.repository';
import { MikroOrmPayoutCommandRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-payout-command.repository';
import { MikroOrmSellerPayableCommandRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-seller-payable-command.repository';
import { loadPayoutAccountSeeds } from './payout-account.seed';

/**
 * How many delivered Orders per shop the seed turns into Seller Payable. The
 * cap keeps the seed fast and the Payout history easy to read; it is larger than
 * the number of Orders a seeded Payout pays so some payable stays available.
 */
const MAX_ORDERS_PER_SHOP = 6;

/** The platform days before today that seeded Payouts belong to. */
const PAYOUT_RUN_DAY_OFFSETS = [8, 3] as const;

/** Marks a Payout the seed created, so a re-run never adds a second history. */
const SEEDED_PAYOUT_PUBLIC_ID_PREFIX = 'pay_seed_';

const PAID_ORDER_MONEY_EVENT_KIND = 'order.paid';
const PAID_PAYOUT_MONEY_EVENT_KIND = 'payout.paid';

/** One delivered Order that can still be credited and made available. */
interface SeedableOrderRow {
  id: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  shipping_minor: number;
  created_at: Date;
  delivered_at: Date;
}

/** An Order whose Seller Payable this seed made available and may pay out. */
interface AvailableOrder {
  orderId: string;
  amountMinor: number;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * Midnight UTC, `days` days before today, so a run day never depends on the local zone.
 */
function daysAgo(days: number): Date {
  const instant = new Date();

  instant.setUTCHours(0, 0, 0, 0);
  instant.setUTCDate(instant.getUTCDate() - days);

  return instant;
}

/**
 * The delivered Orders the seed may still credit: paid or completed (a refunded
 * or canceled Order is never paid out), in the shop's own Settlement Currency so
 * no conversion is involved, and without a Payout Availability so replaying the
 * seed never records one twice.
 */
async function findSeedableOrders(
  em: EntityManager,
  shopId: string,
  currency: string,
): Promise<SeedableOrderRow[]> {
  return em.execute<SeedableOrderRow[]>(
    `select o.id, o.currency, o.subtotal_minor, o.discount_minor, o.shipping_minor,
            o.created_at, o.delivered_at
     from orders o
     where o.shop_id = ?
       and o.currency = ?
       and o.delivered_at is not null
       and o.status in ('paid', 'completed')
       and not exists (
         select 1 from payout_availabilities a where a.order_id = o.id
       )
     order by o.delivered_at asc, o.id asc
     limit ?`,
    [shopId, currency, MAX_ORDERS_PER_SHOP],
  );
}

/** The shops whose seeded Payout Account is active and already has a seeded Payout. */
async function findShopsWithSeededPayouts(
  em: EntityManager,
  shopIds: string[],
): Promise<Set<string>> {
  if (shopIds.length === 0) {
    return new Set();
  }

  const rows = await em.execute<Array<{ shop_id: string }>>(
    `select distinct shop_id
     from payouts
     where strpos(public_id, ?) = 1 and shop_id in (${shopIds.map(() => '?').join(', ')})`,
    [SEEDED_PAYOUT_PUBLIC_ID_PREFIX, ...shopIds],
  );

  return new Set(rows.map((row) => row.shop_id));
}

/**
 * Seeds the Payout half of the finance demo: paid-Order Journal Entries,
 * Payout Availability, Payouts for the shops that can actually be paid, and
 * the Seller Payable position all three of them keep in step.
 *
 * Every write goes through the same repositories the application uses, so the
 * seed cannot produce a position that disagrees with its Postings. A shop whose
 * seeded Payout Account is `pending` is skipped entirely, which is what makes a
 * payable shop visibly different from a non-payable one.
 */
export async function seedPayouts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const activeSeeds = loadPayoutAccountSeeds().filter((seed) => seed.status === 'active');

  if (activeSeeds.length === 0) {
    console.log('[seed][payouts] No shop with an active Payout Account');
    return;
  }

  const shops = activeSeeds.map((seed) => {
    const shop = shopsBySlug.get(seed.shopSlug);

    if (!shop) {
      throw new Error(`[seed][payouts] Unknown shop slug "${seed.shopSlug}"`);
    }

    return shop;
  });
  const seededPayoutShopIds = await findShopsWithSeededPayouts(
    em,
    shops.map((shop) => shop.id),
  );

  const journalEntryRepository = new MikroOrmJournalEntryRepository(em);
  const availabilityRepository = new MikroOrmPayoutAvailabilityRepository(em);
  const sellerPayableRepository = new MikroOrmSellerPayableCommandRepository(em);
  const payoutAccountRepository = new MikroOrmPayoutAccountRepository(em);
  const payoutCommandRepository = new MikroOrmPayoutCommandRepository(em);
  const commissionScheduleRepository = new MikroOrmCommissionScheduleRepository(em);

  console.log(
    `[seed][payouts] Seeding Payout history for ${shops.length} shops with active Payout Accounts`,
  );

  const startedAt = Date.now();
  let seededShopCount = 0;
  let skippedShopCount = 0;
  let recordedAvailabilityCount = 0;
  let createdPayoutCount = 0;

  for (const [index, shop] of shops.entries()) {
    if (seededPayoutShopIds.has(shop.id)) {
      skippedShopCount += 1;
    }
    else {
      const account = await payoutAccountRepository.findPayableByShopId(shop.id);

      if (!account) {
        console.log(
          `[seed][payouts] ${shop.slug}: no open active Payout Account, skipping`,
        );
        skippedShopCount += 1;
      }
      else if (account.provider !== MANUAL_BANK_PROVIDER || account.currency !== shop.currency) {
        console.log(
          `[seed][payouts] ${shop.slug}: Payout Account is ${account.provider} in ${account.currency}, expected ${MANUAL_BANK_PROVIDER} in ${shop.currency}, skipping`,
        );
        skippedShopCount += 1;
      }
      else {
        const schedules = await commissionScheduleRepository.listByShopId(shop.id);
        const orders = await findSeedableOrders(em, shop.id, shop.currency);

        if (orders.length < 2) {
          // A Payout may not consume every available Order: the shop must still
          // show an available balance after its history, so one Order is not
          // enough to seed a payout from.
          console.log(
            `[seed][payouts] ${shop.slug}: ${orders.length} delivered order(s) in ${shop.currency}, need at least 2, skipping`,
          );
          skippedShopCount += 1;
        }
        else {
          const result = await em.transactional(async (entityManager) => {
            const availableOrders: AvailableOrder[] = [];

            for (const order of orders) {
              const occurredAt = new Date(order.created_at);
              const schedule = resolveEffectiveSchedule(schedules, occurredAt);
              const commissionMinor = schedule
                ? calculateCommissionMinor(
                  order.subtotal_minor - order.discount_minor,
                  schedule.rateBasisPoints,
                )
                : 0;

              const postings = buildPaidOrderPostings({
                shopId: shop.id,
                settlementCurrency: shop.currency,
                discountedItemSubtotalMinor: order.subtotal_minor - order.discount_minor,
                shippingMinor: order.shipping_minor,
                commissionMinor,
              });

              const entry = {
                moneyEventKey: paidOrderMoneyEventKey(order.id),
                moneyEventKind: PAID_ORDER_MONEY_EVENT_KIND,
                shopId: shop.id,
                currency: shop.currency,
                occurredAt,
                postings,
              };

              assertBalancedJournalEntry(entry);

              const appended = await journalEntryRepository.append(entry, {
                entityManager,
              });

              if (!appended) {
                // A paid event already recorded this Order's money; its
                // availability belongs to the real delivery flow.
                continue;
              }

              const payableMinor = postings
                .filter((posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE)
                .reduce((total, posting) => total + posting.amountMinor, 0);

              await sellerPayableRepository.creditNotYetAvailable(
                shop.id,
                shop.currency,
                payableMinor,
                { entityManager },
              );

              const recorded = await availabilityRepository.record(
                {
                  orderId: order.id,
                  shopId: shop.id,
                  currency: shop.currency,
                  amountMinor: payableMinor,
                  deliveredAt: new Date(order.delivered_at),
                  evidence: [],
                },
                { entityManager },
              );

              if (!recorded) {
                continue;
              }

              await sellerPayableRepository.releaseToAvailable(
                shop.id,
                shop.currency,
                payableMinor,
                { entityManager },
              );

              availableOrders.push({
                orderId: order.id,
                amountMinor: payableMinor,
              });
            }

            if (availableOrders.length < 2) {
              return { records: 0, payouts: 0 };
            }

            // Pay two thirds of what is available, split into two past run days,
            // so the oldest Orders are discharged and the newest stay available.
            const lineCount = Math.min(
              availableOrders.length - 1,
              Math.max(1, Math.floor((availableOrders.length * 2) / 3)),
            );
            const firstSliceCount = Math.ceil(lineCount / 2);
            const slices = [
              availableOrders.slice(0, firstSliceCount),
              availableOrders.slice(firstSliceCount, lineCount),
            ].filter((slice) => slice.length > 0);

            let createdPayouts = 0;

            for (const [sliceIndex, slice] of slices.entries()) {
              const paidAt = daysAgo(PAYOUT_RUN_DAY_OFFSETS[sliceIndex]);
              const amountMinor = slice.reduce((total, order) => total + order.amountMinor, 0);

              if (amountMinor <= 0) {
                continue;
              }

              const claimed = await payoutCommandRepository.claim(
                {
                  // `pay_seed_` plus 12 hex characters stays inside the 32-char column.
                  publicId: `${SEEDED_PAYOUT_PUBLIC_ID_PREFIX}${randomBytes(6).toString('hex')}`,
                  shopId: shop.id,
                  payoutAccountId: account.id,
                  currency: shop.currency,
                  amountMinor,
                  runDay: payoutRunDay(paidAt),
                  // Seeded history predates the monthly schedule: it belongs to
                  // no platform month and never uses up a live allowance.
                  source: 'scheduled',
                  periodKey: null,
                  quotaConsumed: false,
                  allocations: slice.map((order) => ({
                    orderId: order.orderId,
                    amountMinor: order.amountMinor,
                  })),
                  // Seeded history pays into an account in the shop currency, so
                  // its frozen quote is the identity.
                  sourceCurrency: shop.currency,
                  targetCurrency: account.currency,
                  transferCurrency: shop.currency,
                  transferAmountMinor: amountMinor,
                  fxRate: '1',
                  targetAmountMinor: amountMinor,
                  fxFeeMinor: 0,
                },
                { entityManager },
              );

              if (!claimed.payout) {
                throw new Error(
                  `[seed][payouts] ${shop.slug}: could not claim the ${payoutRunDay(paidAt)} Payout (${claimed.rejection})`,
                );
              }

              // The manual adapter's reference is the Payout's own public id.
              const settled = await payoutCommandRepository.settle(
                {
                  payoutId: claimed.payout.id,
                  providerReference: claimed.payout.publicId,
                  paidAt,
                  orders: slice.map((order) => ({
                    orderId: order.orderId,
                    amountMinor: order.amountMinor,
                  })),
                  providerFxRate: null,
                  targetAmountMinor: null,
                },
                { entityManager },
              );

              if (!settled) {
                throw new Error(
                  `[seed][payouts] ${shop.slug}: Payout ${claimed.payout.publicId} was not pending at settle time`,
                );
              }

              const payoutEntry = {
                moneyEventKey: paidPayoutMoneyEventKey(claimed.payout.id),
                moneyEventKind: PAID_PAYOUT_MONEY_EVENT_KIND,
                shopId: shop.id,
                currency: shop.currency,
                occurredAt: paidAt,
                postings: buildPaidPayoutPostings({
                  shopId: shop.id,
                  currency: shop.currency,
                  amountMinor,
                }),
              };

              assertBalancedJournalEntry(payoutEntry);

              await journalEntryRepository.append(payoutEntry, { entityManager });

              await sellerPayableRepository.dischargeAvailable(
                shop.id,
                shop.currency,
                amountMinor,
                { entityManager },
              );

              createdPayouts += 1;
            }

            await entityManager.flush();

            return { records: availableOrders.length, payouts: createdPayouts };
          });

          recordedAvailabilityCount += result.records;
          createdPayoutCount += result.payouts;

          if (result.records > 0) {
            seededShopCount += 1;
          }
          else {
            skippedShopCount += 1;
          }
        }
      }
    }

    console.log(
      `[seed][payouts] Processed ${index + 1}/${shops.length} shops in ${formatDuration(Date.now() - startedAt)}`,
    );
  }

  console.log(
    `[seed][payouts] Seeded ${createdPayoutCount} Payouts over ${recordedAvailabilityCount} Orders for ${seededShopCount} shops; skipped ${skippedShopCount} in ${formatDuration(Date.now() - startedAt)}`,
  );
}
