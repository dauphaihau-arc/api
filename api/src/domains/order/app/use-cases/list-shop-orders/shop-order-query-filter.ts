import type { FilterQuery } from '@mikro-orm/core';
import { fromMinorUnits } from '~/platform/utils/money';
import type { ListShopOrdersQueryDto } from '../../../api/rest/dto/list-shop-orders.query.dto';
import type { OrderEntity } from '../../../infra/persistence/entities/order.entity';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildShopOrderWhere(
  shopId: string,
  query: Pick<ListShopOrdersQueryDto,
    | 'shippingStatus'
    | 'createdFrom'
    | 'createdTo'
    | 'amountMin'
    | 'amountMax'
    | 'currency'
    | 'paymentType'
    | 'search'
  >,
): FilterQuery<OrderEntity> {
  const where: FilterQuery<OrderEntity> = { shop: shopId };
  const andConditions: FilterQuery<OrderEntity>[] = [];

  if (query.shippingStatus?.length) {
    where.shippingStatus = { $in: query.shippingStatus };
  }

  if (query.createdFrom || query.createdTo) {
    where.createdAt = {
      ...(query.createdFrom ? { $gte: query.createdFrom } : {}),
      ...(query.createdTo ? { $lte: query.createdTo } : {}),
    };
  }

  if (query.amountMin !== undefined || query.amountMax !== undefined) {
    const amountMinorFilter = {
      ...(query.amountMin !== undefined ? { $gte: query.amountMin } : {}),
      ...(query.amountMax !== undefined ? { $lte: query.amountMax } : {}),
    };

    const amountCurrency = query.currency?.length === 1 ? query.currency[0] : undefined;

    if (amountCurrency) {
      andConditions.push({
        $or: [
          { totalMinor: amountMinorFilter },
          {
            totalMinor: null,
            total: {
              ...(query.amountMin !== undefined
                ? { $gte: fromMinorUnits(query.amountMin, amountCurrency) }
                : {}),
              ...(query.amountMax !== undefined
                ? { $lte: fromMinorUnits(query.amountMax, amountCurrency) }
                : {}),
            },
          },
        ],
      });
    }
    else {
      where.totalMinor = amountMinorFilter;
    }
  }

  if (query.currency?.length) {
    where.currency = { $in: query.currency };
  }

  if (query.paymentType?.length) {
    where.paymentType = { $in: query.paymentType };
  }

  if (query.search?.trim()) {
    const search = query.search.trim();
    const searchConditions: FilterQuery<OrderEntity>[] = [
      { customerEmail: { $ilike: `%${search}%` } },
      { orderNumber: { $ilike: `%${search}%` } },
    ];

    if (UUID_V4_REGEX.test(search)) {
      searchConditions.push({ id: search });
    }

    andConditions.push({
      $or: searchConditions,
    });
  }

  return andConditions.length > 0
    ? { ...where, $and: andConditions }
    : where;
}

export function mergeShopOrderWhere(
  where: FilterQuery<OrderEntity>,
  extra: Record<string, unknown>,
): FilterQuery<OrderEntity> {
  return {
    ...(where as Record<string, unknown>),
    ...extra,
  } as FilterQuery<OrderEntity>;
}
