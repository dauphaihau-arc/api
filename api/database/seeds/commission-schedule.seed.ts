import type { EntityManager } from '@mikro-orm/postgresql';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { CommissionScheduleEntity } from '~/domains/finance/infra/persistence/entities/commission-schedule.entity';
import {
  COMMISSION_SCHEDULES_LOCAL_TSV_PATH,
  COMMISSION_SCHEDULES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type CommissionScheduleSeed = {
  shopSlug: string;
  effectiveFrom: Date;
  rateBasisPoints: number;
};

type CommissionScheduleCsvRow = {
  shop_slug: string;
  effective_from: string;
  rate_basis_points: string;
};

function loadCommissionScheduleSeeds(): CommissionScheduleSeed[] {
  return [
    ...readTsvRows<CommissionScheduleCsvRow>(COMMISSION_SCHEDULES_TSV_PATH),
    ...readOptionalTsvRows<CommissionScheduleCsvRow>(COMMISSION_SCHEDULES_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const seedKey = `${row.shop_slug}::${row.effective_from}::${row.rate_basis_points}#${index + 2}`;

    if (!row.shop_slug.trim()) {
      throw new Error(`Missing shop_slug for commission schedule seed ${seedKey}`);
    }

    const effectiveFrom = new Date(row.effective_from.trim());
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new Error(`Invalid effective_from for commission schedule seed ${seedKey}`);
    }

    const rateBasisPoints = Number(row.rate_basis_points);
    if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
      throw new Error(`Invalid rate_basis_points for commission schedule seed ${seedKey}`);
    }

    return {
      shopSlug: row.shop_slug.trim(),
      effectiveFrom,
      rateBasisPoints,
    };
  });
}

const commissionScheduleSeeds: CommissionScheduleSeed[] = loadCommissionScheduleSeeds();

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

export async function seedCommissionSchedules(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  if (commissionScheduleSeeds.length === 0) {
    console.log('[seed][commission-schedules] No commission schedules to seed');
    return;
  }

  const progressInterval = resolveProgressInterval(commissionScheduleSeeds.length);
  const startedAt = Date.now();
  const shops = [...new Set(commissionScheduleSeeds.map((seed) => seed.shopSlug))].map(
    (slug) => {
      const shop = shopsBySlug.get(slug);
      if (!shop) {
        throw new Error(`Missing shop for commission schedule seed: ${slug}`);
      }

      return shop;
    },
  );
  const existingSchedules = await em.find(CommissionScheduleEntity, {
    shop: { $in: shops },
  });
  const existingSchedulesByKey = new Map(
    existingSchedules.map((schedule) => [
      `${schedule.shop.id}::${schedule.effectiveFrom.toISOString()}`,
      schedule,
    ]),
  );

  console.log(
    `[seed][commission-schedules] Upserting ${commissionScheduleSeeds.length} commission schedules`,
  );

  for (const [index, seed] of commissionScheduleSeeds.entries()) {
    const shop = shopsBySlug.get(seed.shopSlug);
    if (!shop) {
      throw new Error(`Missing shop for commission schedule seed: ${seed.shopSlug}`);
    }

    const key = `${shop.id}::${seed.effectiveFrom.toISOString()}`;
    const schedule =
      existingSchedulesByKey.get(key) ??
      em.create(CommissionScheduleEntity, {
        shop,
        effectiveFrom: seed.effectiveFrom,
        rateBasisPoints: seed.rateBasisPoints,
      });
    existingSchedulesByKey.set(key, schedule);

    schedule.shop = shop;
    schedule.effectiveFrom = seed.effectiveFrom;
    schedule.rateBasisPoints = seed.rateBasisPoints;
    em.persist(schedule);

    if ((index + 1) % progressInterval === 0 || index + 1 === commissionScheduleSeeds.length) {
      console.log(
        `[seed][commission-schedules] Processed ${index + 1}/${commissionScheduleSeeds.length} commission schedules in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();
}
