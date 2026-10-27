import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import type { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import type { CommissionSchedule } from '../../domain/rules/commission-schedule';
import type { GetCommissionScheduleUseCase } from '../../app/use-cases/get-commission-schedule/get-commission-schedule.use-case';
import type { RecordCommissionScheduleUseCase } from '../../app/use-cases/record-commission-schedule/record-commission-schedule.use-case';
import { AdminCommissionScheduleController } from './admin-commission-schedule.controller';

const SHOP_PUBLIC_ID = 'shp_01HZY4T2M8R6N3Q7W9K1V0B5CD';

function setup(scheduleInForce: CommissionSchedule | null) {
  const shopAccessService = {
    resolveShopPublicId: jest.fn().mockResolvedValue('shop-1'),
  } as unknown as ShopAccessService;
  const recordCommissionScheduleUseCase = {
    execute: jest.fn(),
  } as unknown as RecordCommissionScheduleUseCase;
  const getCommissionScheduleUseCase = {
    execute: jest.fn().mockResolvedValue(scheduleInForce),
  } as unknown as GetCommissionScheduleUseCase;

  return {
    controller: new AdminCommissionScheduleController(
      shopAccessService,
      recordCommissionScheduleUseCase,
      getCommissionScheduleUseCase,
    ),
    shopAccessService,
    recordCommissionScheduleUseCase,
    getCommissionScheduleUseCase,
  };
}

describe('AdminCommissionScheduleController', () => {
  it('requires the finance management permission', () => {
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_PERMISSIONS_KEY,
        AdminCommissionScheduleController,
      ),
    ).toEqual(['finance.manage']);
  });

  it('reads the schedule in force for the resolved shop', async () => {
    const { controller, shopAccessService, getCommissionScheduleUseCase } =
      setup({
        shopId: 'shop-1',
        effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
        rateBasisPoints: 1500,
      });

    await expect(controller.read(SHOP_PUBLIC_ID)).resolves.toEqual({
      shop_id: SHOP_PUBLIC_ID,
      schedule: {
        effective_from: '2026-04-01T00:00:00.000Z',
        rate_basis_points: 1500,
      },
    });
    expect(shopAccessService.resolveShopPublicId).toHaveBeenCalledWith(
      SHOP_PUBLIC_ID,
    );
    expect(getCommissionScheduleUseCase.execute).toHaveBeenCalledWith({
      shopId: 'shop-1',
    });
  });

  it('reads a null schedule without inventing a rate', async () => {
    const { controller } = setup(null);

    await expect(controller.read(SHOP_PUBLIC_ID)).resolves.toEqual({
      shop_id: SHOP_PUBLIC_ID,
      schedule: null,
    });
  });

  it('does not record a schedule on read', async () => {
    const { controller, recordCommissionScheduleUseCase } = setup(null);

    await controller.read(SHOP_PUBLIC_ID);

    expect(recordCommissionScheduleUseCase.execute).not.toHaveBeenCalled();
  });
});
