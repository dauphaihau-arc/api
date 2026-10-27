import type { CommissionSchedule } from '../../../domain/rules/commission-schedule';
import type { CommissionScheduleRepository } from '../../ports/commission-schedule.repository';
import { GetCommissionScheduleUseCase } from './get-commission-schedule.use-case';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const SHOP_ID = 'shop-1';

function schedule(
  effectiveFrom: string,
  rateBasisPoints: number,
): CommissionSchedule {
  return {
    shopId: SHOP_ID,
    effectiveFrom: new Date(effectiveFrom),
    rateBasisPoints,
  };
}

function setup(schedules: CommissionSchedule[]) {
  const commissionScheduleRepository = {
    listByShopId: jest.fn().mockResolvedValue(schedules),
  } as unknown as CommissionScheduleRepository;

  return new GetCommissionScheduleUseCase(commissionScheduleRepository, {
    now: () => NOW,
  });
}

describe('GetCommissionScheduleUseCase', () => {
  it('reports the latest schedule that has already taken effect', async () => {
    const inForce = schedule('2026-04-01T00:00:00.000Z', 1200);

    await expect(
      setup([
        inForce,
        schedule('2026-01-01T00:00:00.000Z', 1500),
        schedule('2026-12-01T00:00:00.000Z', 900),
      ]).execute({ shopId: SHOP_ID }),
    ).resolves.toEqual(inForce);
  });

  it('reports a schedule effective exactly now', async () => {
    const startingNow = schedule(NOW.toISOString(), 1000);

    await expect(
      setup([startingNow]).execute({ shopId: SHOP_ID }),
    ).resolves.toEqual(startingNow);
  });

  it('reports null when every schedule starts in the future', async () => {
    await expect(
      setup([
        schedule('2026-11-01T00:00:00.000Z', 1500),
        schedule('2027-01-01T00:00:00.000Z', 1200),
      ]).execute({ shopId: SHOP_ID }),
    ).resolves.toBeNull();
  });

  it('reports null when the shop has no schedule at all', async () => {
    await expect(
      setup([]).execute({ shopId: SHOP_ID }),
    ).resolves.toBeNull();
  });
});
