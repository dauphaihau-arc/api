import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildUserEventsChannelKey } from '~/platform/sse/app/user-events-channel';
import { SsePublisher } from '~/platform/sse/infra/sse.publisher';
import {
  ORDER_EXPORT_COMPLETED_SSE_EVENT,
  ORDER_EXPORT_FAILED_SSE_EVENT,
  ORDER_EXPORT_PROGRESS_SSE_EVENT,
  type OrderExportCompletedSseEventPayload,
  type OrderExportFailedSseEventPayload,
  type OrderExportProgressSseEventPayload,
} from '../app/events/order-export-sse.event';

@Injectable()
export class ForwardOrderExportToSseListener {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @OnEvent(ORDER_EXPORT_PROGRESS_SSE_EVENT, { async: true, suppressErrors: true })
  handleProgress(payload: OrderExportProgressSseEventPayload): void {
    this.publish(payload.userId, 'order_export.progress', {
      exportId: payload.exportId,
      status: payload.status,
      processedRows: payload.processedRows,
      totalRows: payload.totalRows,
      percent: calculatePercent(payload.processedRows, payload.totalRows),
      filename: payload.filename,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  }

  @OnEvent(ORDER_EXPORT_COMPLETED_SSE_EVENT, { async: true, suppressErrors: true })
  handleCompleted(payload: OrderExportCompletedSseEventPayload): void {
    this.publish(payload.userId, 'order_export.completed', {
      exportId: payload.exportId,
      status: payload.status,
      processedRows: payload.processedRows,
      totalRows: payload.totalRows,
      percent: 100,
      filename: payload.filename,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  }

  @OnEvent(ORDER_EXPORT_FAILED_SSE_EVENT, { async: true, suppressErrors: true })
  handleFailed(payload: OrderExportFailedSseEventPayload): void {
    this.publish(payload.userId, 'order_export.failed', {
      exportId: payload.exportId,
      status: payload.status,
      message: payload.message,
      filename: payload.filename,
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
