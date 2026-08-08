import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildUserEventsChannelKey } from '~/platform/sse/app/user-events-channel';
import { SsePublisher } from '~/platform/sse/infra/sse.publisher';
import {
  PRODUCT_IMPORT_COMPLETED_SSE_EVENT,
  PRODUCT_IMPORT_FAILED_SSE_EVENT,
  PRODUCT_IMPORT_PROGRESS_SSE_EVENT,
  type ProductImportCompletedSseEventPayload,
  type ProductImportFailedSseEventPayload,
  type ProductImportProgressSseEventPayload,
} from '../app/events/product-import-sse.event';

@Injectable()
export class ForwardProductImportToSseListener {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @OnEvent(PRODUCT_IMPORT_PROGRESS_SSE_EVENT, { async: true, suppressErrors: true })
  handleProgress(payload: ProductImportProgressSseEventPayload): void {
    this.publish(payload.userId, 'product_import.progress', {
      importId: payload.importId,
      status: payload.status,
      processedRows: payload.processedRows,
      createdRows: payload.createdRows,
      failedRows: payload.failedRows,
      totalRows: payload.totalRows,
      percent: calculatePercent(payload.processedRows, payload.totalRows),
      filename: payload.filename,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  }

  @OnEvent(PRODUCT_IMPORT_COMPLETED_SSE_EVENT, { async: true, suppressErrors: true })
  handleCompleted(payload: ProductImportCompletedSseEventPayload): void {
    this.publish(payload.userId, 'product_import.completed', {
      importId: payload.importId,
      status: payload.status,
      processedRows: payload.processedRows,
      createdRows: payload.createdRows,
      failedRows: payload.failedRows,
      totalRows: payload.totalRows,
      percent: 100,
      filename: payload.filename,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  }

  @OnEvent(PRODUCT_IMPORT_FAILED_SSE_EVENT, { async: true, suppressErrors: true })
  handleFailed(payload: ProductImportFailedSseEventPayload): void {
    this.publish(payload.userId, 'product_import.failed', {
      importId: payload.importId,
      status: payload.status,
      processedRows: payload.processedRows,
      createdRows: payload.createdRows,
      failedRows: payload.failedRows,
      totalRows: payload.totalRows,
      percent: calculatePercent(payload.processedRows, payload.totalRows),
      filename: payload.filename,
      message: payload.message,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  }

  private publish(
    userId: string,
    eventType: string,
    data: Record<string, unknown>,
  ) {
    this.ssePublisher.publish(buildUserEventsChannelKey(userId), {
      id: randomUUID(),
      type: 'message',
      data: {
        eventType,
        ...data,
      },
    });
  }
}

function calculatePercent(processedRows: number, totalRows: number) {
  if (totalRows <= 0) {
    return 100;
  }

  return Math.min(99, Math.floor((processedRows / totalRows) * 100));
}
