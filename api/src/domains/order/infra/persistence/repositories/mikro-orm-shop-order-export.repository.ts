import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { OrderExportStatus } from '../../../domain/enums/order-export-status.enum';
import {
  type CompleteShopOrderExportInput,
  type CreateQueuedShopOrderExportInput,
  ShopOrderExportRepository,
  type ShopOrderExportSummary,
} from '../../../app/ports/shop-order-export.repository';
import { OrderExportEntity } from '../entities/order-export.entity';

@Injectable()
export class MikroOrmShopOrderExportRepository
implements ShopOrderExportRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async createQueued(
    input: CreateQueuedShopOrderExportInput,
  ): Promise<ShopOrderExportSummary> {
    const entityManager = this.entityManager.fork();
    const orderExport = new OrderExportEntity();

    orderExport.shop = entityManager.getReference(ShopEntity, input.shopId);
    orderExport.requestedBy = entityManager.getReference(UserEntity, input.requestedByUserId);
    orderExport.status = OrderExportStatus.QUEUED;
    orderExport.filtersJson = input.filtersJson;
    orderExport.columnsJson = input.columnsJson;
    orderExport.timezone = input.timezone;
    orderExport.filename = input.filename;
    orderExport.totalRows = input.totalRows;
    orderExport.processedRows = 0;
    orderExport.expiresAt = input.expiresAt;

    await entityManager.persist(orderExport).flush();

    return toShopOrderExportSummary(orderExport);
  }

  async findByShopId(
    shopId: string,
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      { id: exportId, shop: shopId },
      { populate: ['shop', 'requestedBy'] },
    );

    return orderExport ? toShopOrderExportSummary(orderExport) : undefined;
  }

  async findForProcessing(
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      exportId,
      { populate: ['shop', 'requestedBy'] },
    );

    return orderExport ? toShopOrderExportSummary(orderExport) : undefined;
  }

  async markProcessing(
    exportId: string,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      exportId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!orderExport) {
      return undefined;
    }

    orderExport.status = OrderExportStatus.PROCESSING;
    orderExport.errorMessage = undefined;
    await entityManager.flush();

    return toShopOrderExportSummary(orderExport);
  }

  async updateProgress(
    exportId: string,
    processedRows: number,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      exportId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!orderExport) {
      return undefined;
    }

    orderExport.processedRows = processedRows;
    await entityManager.flush();

    return toShopOrderExportSummary(orderExport);
  }

  async markCompleted(
    input: CompleteShopOrderExportInput,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      input.exportId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!orderExport) {
      return undefined;
    }

    orderExport.status = OrderExportStatus.COMPLETED;
    orderExport.fileStorageKey = input.fileStorageKey;
    orderExport.processedRows = input.processedRows;
    orderExport.completedAt = input.completedAt;
    await entityManager.flush();

    return toShopOrderExportSummary(orderExport);
  }

  async markFailed(
    exportId: string,
    errorMessage: string,
  ): Promise<ShopOrderExportSummary | undefined> {
    const entityManager = this.entityManager.fork();

    const orderExport = await entityManager.findOne(
      OrderExportEntity,
      exportId,
      { populate: ['shop', 'requestedBy'] },
    );

    if (!orderExport) {
      return undefined;
    }

    orderExport.status = OrderExportStatus.FAILED;
    orderExport.errorMessage = errorMessage;
    await entityManager.flush();

    return toShopOrderExportSummary(orderExport);
  }
}

function toShopOrderExportSummary(
  orderExport: OrderExportEntity,
): ShopOrderExportSummary {
  return {
    id: orderExport.id,
    shopId: orderExport.shop.id,
    requestedByUserId: orderExport.requestedBy.id,
    status: orderExport.status,
    filtersJson: orderExport.filtersJson,
    columnsJson: orderExport.columnsJson,
    timezone: orderExport.timezone,
    filename: orderExport.filename,
    totalRows: orderExport.totalRows,
    processedRows: orderExport.processedRows,
    fileStorageKey: orderExport.fileStorageKey,
    errorMessage: orderExport.errorMessage,
    completedAt: orderExport.completedAt,
    expiresAt: orderExport.expiresAt,
    createdAt: orderExport.createdAt,
    updatedAt: orderExport.updatedAt,
  };
}
