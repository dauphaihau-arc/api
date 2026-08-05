import { createReadStream } from 'node:fs';
import {
  appendFile, mkdtemp, rm, stat, writeFile, 
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { ExportShopOrdersQueryDto, ShopOrderExportColumnPreset } from '../api/rest/dto/export-shop-orders.query.dto';
import {
  ORDER_EXPORT_COMPLETED_SSE_EVENT,
  ORDER_EXPORT_FAILED_SSE_EVENT,
  ORDER_EXPORT_PROGRESS_SSE_EVENT,
} from '../app/events/order-export-sse.event';
import { ShopOrderExportQueryRepository } from '../app/ports/shop-order-export-query.repository';
import {
  ShopOrderExportRepository,
  type ShopOrderExportSummary,
} from '../app/ports/shop-order-export.repository';
import {
  buildShopOrderCsvHeader,
  buildShopOrderCsvRows,
} from '../app/use-cases/export-shop-orders/shop-order-csv';
import { resolveExportColumns } from '../app/use-cases/export-shop-orders/shop-order-export-columns';
import { OrderExportStatus } from '../domain/enums/order-export-status.enum';

type ProcessShopOrderExportPayload =
  AppJobPayloadMap['order.process-shop-order-export'];

const EXPORT_BATCH_SIZE = 1_000;

@Injectable()
export class ProcessShopOrderExportJob {
  constructor(
    private readonly orderExportRepository: ShopOrderExportRepository,
    private readonly exportQueryRepository: ShopOrderExportQueryRepository,
    private readonly storageService: StorageService,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(payload: ProcessShopOrderExportPayload): Promise<void> {
    const existingExport = await this.orderExportRepository.findForProcessing(payload.exportId);

    if (!existingExport || existingExport.status === OrderExportStatus.COMPLETED) {
      return;
    }

    let orderExport = existingExport;
    const query = restoreExportQuery(orderExport);

    const columns = resolveExportColumns(
      query.columnPreset,
      orderExport.columnsJson,
    );

    const workDir = await mkdtemp(path.join(os.tmpdir(), 'arc-order-export-'));
    const filePath = path.join(workDir, orderExport.filename);

    try {
      orderExport = await this.orderExportRepository.markProcessing(orderExport.id) ?? orderExport;
      this.publishProgress(orderExport);

      await writeFile(filePath, buildShopOrderCsvHeader(columns));

      let offset = 0;
      let processedRows = 0;

      while (true) {
        const rows = await this.exportQueryRepository.listForExportBatch(
          orderExport.shopId,
          query,
          offset,
          EXPORT_BATCH_SIZE,
        );

        if (rows.length === 0) {
          break;
        }

        await appendFile(filePath, `\r\n${buildShopOrderCsvRows(columns, rows)}`);
        processedRows += rows.length;
        offset += rows.length;

        orderExport = await this.orderExportRepository.updateProgress(orderExport.id, processedRows) ??
          { ...orderExport, processedRows };

        this.publishProgress(orderExport);
      }

      const storageKey = buildExportStorageKey(orderExport);
      const fileStat = await stat(filePath);

      await this.storageService.putObject({
        key: storageKey,
        body: createReadStream(filePath),
        contentType: 'text/csv; charset=utf-8',
        contentLength: fileStat.size,
      });

      orderExport = await this.orderExportRepository.markCompleted({
        exportId: orderExport.id,
        fileStorageKey: storageKey,
        processedRows,
        completedAt: new Date(),
      }) ?? {
        ...orderExport,
        status: OrderExportStatus.COMPLETED,
        fileStorageKey: storageKey,
        processedRows,
      };

      await this.notifyUserUseCase.execute({
        userId: orderExport.requestedByUserId,
        type: 'seller.order_export.completed',
        title: 'Export ready',
        body: `${orderExport.filename} is ready.`,
        data: {
          target: 'order_export_download',
          export_id: orderExport.id,
          shop_id: orderExport.shopId,
          filename: orderExport.filename,
        },
        channels: ['in_app'],
      });

      this.eventEmitter.emit(ORDER_EXPORT_COMPLETED_SSE_EVENT, {
        userId: orderExport.requestedByUserId,
        exportId: orderExport.id,
        status: 'completed',
        processedRows: orderExport.processedRows,
        totalRows: orderExport.totalRows ?? processedRows,
        filename: orderExport.filename,
      });
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';

      orderExport = await this.orderExportRepository.markFailed(orderExport.id, errorMessage) ??
        { ...orderExport, status: OrderExportStatus.FAILED, errorMessage };

      this.eventEmitter.emit(ORDER_EXPORT_FAILED_SSE_EVENT, {
        userId: orderExport.requestedByUserId,
        exportId: orderExport.id,
        status: 'failed',
        message: orderExport.errorMessage ?? errorMessage,
        filename: orderExport.filename,
      });
      throw error;
    }
    finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private publishProgress(orderExport: ShopOrderExportSummary) {
    this.eventEmitter.emit(ORDER_EXPORT_PROGRESS_SSE_EVENT, {
      userId: orderExport.requestedByUserId,
      exportId: orderExport.id,
      status: orderExport.status === OrderExportStatus.QUEUED ? 'queued' : 'processing',
      processedRows: orderExport.processedRows,
      totalRows: orderExport.totalRows ?? 0,
      filename: orderExport.filename,
    });
  }
}

function restoreExportQuery(orderExport: ShopOrderExportSummary): ExportShopOrdersQueryDto {
  const snapshot = orderExport.filtersJson;
  const query = new ExportShopOrdersQueryDto();

  query.page = 1;
  query.limit = EXPORT_BATCH_SIZE;
  query.status = snapshot.status as ExportShopOrdersQueryDto['status'];
  query.shippingStatus = snapshot.shippingStatus as ExportShopOrdersQueryDto['shippingStatus'];
  query.createdFrom = parseOptionalDate(snapshot.createdFrom);
  query.createdTo = parseOptionalDate(snapshot.createdTo);
  query.amountMin = typeof snapshot.amountMin === 'number' ? snapshot.amountMin : undefined;
  query.amountMax = typeof snapshot.amountMax === 'number' ? snapshot.amountMax : undefined;
  query.currency = snapshot.currency as ExportShopOrdersQueryDto['currency'];
  query.paymentType = snapshot.paymentType as ExportShopOrdersQueryDto['paymentType'];
  query.search = typeof snapshot.search === 'string' ? snapshot.search : undefined;
  query.dateRange = snapshot.dateRange as ExportShopOrdersQueryDto['dateRange'];
  query.timezone = typeof snapshot.timezone === 'string' ? snapshot.timezone : 'UTC';
  query.columnPreset = ShopOrderExportColumnPreset.CUSTOM;
  query.columns = orderExport.columnsJson;

  return query;
}

function parseOptionalDate(value: unknown) {
  return typeof value === 'string' ? new Date(value) : undefined;
}

function buildExportStorageKey(orderExport: ShopOrderExportSummary) {
  return [
    process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    'private',
    'shops',
    orderExport.shopId,
    'order-exports',
    orderExport.id,
    `${randomUUID()}-${orderExport.filename}`,
  ].join('/');
}
