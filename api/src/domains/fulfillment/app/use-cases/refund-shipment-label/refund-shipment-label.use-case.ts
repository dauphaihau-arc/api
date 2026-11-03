import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { RecordLabelMoneyEventUseCase } from '~/domains/finance/app/use-cases/record-label-money-event/record-label-money-event.use-case';
import {
  FINANCE_CONFIG,
  type FinanceConfig,
} from '~/platform/config/finance.config';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import {
  CarrierLabelAlreadyUsedError,
  CarrierLabelNotFoundError,
  CarrierLabelRefundUnavailableError,
  CarrierParcelGateway,
} from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { ShipmentLabelStatus } from '../../../domain/enums/shipment-label-status.enum';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import {
  CarrierLabelUnavailableError,
  ShipmentLabelNotFoundError,
  ShipmentLabelUsedError,
} from '../../errors/fulfillment-app.error';
import { ShipmentLabelEntity } from '../../../infra/persistence/entities/shipment-label.entity';
import { buildLabelMoneyEvent } from '../../events/label-money-event';
import { LabelMoneyEventOutboxService } from '../../services/label-money-event-outbox.service';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

/**
 * Refunds an unused carrier label: the carrier voids it first, then one local
 * transaction voids the Label and its Shipment, retains the history, releases
 * the quantities, and publishes the `label.refunded` money event. A label that
 * is already voided returns the current view without calling the carrier, so a
 * repeated refund is idempotent; a scanned label is refused.
 */
@Injectable()
export class RefundShipmentLabelUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
    private readonly carrierParcelGateway: CarrierParcelGateway,
    private readonly labelMoneyEventOutboxService: LabelMoneyEventOutboxService,
    private readonly recordLabelMoneyEventUseCase: RecordLabelMoneyEventUseCase,
    private readonly entityManager: EntityManager,
    @Inject(FINANCE_CONFIG) private readonly financeConfig: FinanceConfig,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    shipmentId: string,
    actorId: string,
  ) {
    return this.commandRunner.execute(
      shopId,
      orderId,
      async (context, entityManager) => {
        const result = await this.fulfillmentService.refundLabel(entityManager, {
          orderId: context.id,
          shopId: context.shopId,
          shipmentId,
          actor: {
            actorType: ShipmentUpdateActorType.SELLER,
            actorId,
            source: ShipmentUpdateSource.SELLER,
          },
        });

        if (!result.refunded || !result.label) {
          return;
        }

        const occurredAt = new Date();
        const labelRefundInput = {
          labelId: result.label.publicId,
          shopId: context.shopId,
          orderId: context.id,
          amountMinor: result.label.priceMinor,
          currency: result.label.currency,
          occurredAt,
        };

        const labelRefundedOutboxEvent =
          await this.labelMoneyEventOutboxService.createLabelRefundedEvent(
            entityManager,
            labelRefundInput,
          );

        // `inline` reverses the charge inside the producer's transaction, so a
        // booking failure rolls the void back and the seller retries. The outbox
        // row is kept and marked processed as evidence, and the worker skips it.
        if (this.financeConfig.moneyEventBooking === 'inline') {
          await this.recordLabelMoneyEventUseCase.recordWithin(
            entityManager,
            buildLabelMoneyEvent(labelRefundInput),
            'refunded',
          );
          labelRefundedOutboxEvent.status = OutboxEventStatus.PROCESSED;
          labelRefundedOutboxEvent.processedAt = occurredAt;
          await entityManager.flush();
        }
      },
      {
        allowIneligibleOrder: true,
        beforeTransaction: async (context) => {
          const label = await this.entityManager.fork()
            .getRepository(ShipmentLabelEntity)
            .findOne({ shopId: context.shopId, orderId: context.id, shipment: shipmentId });

          if (!label) {
            throw new ShipmentLabelNotFoundError();
          }

          if (label.status === ShipmentLabelStatus.VOIDED) {
            return;
          }

          if (label.status === ShipmentLabelStatus.USED) {
            throw new ShipmentLabelUsedError();
          }

          await this.refundWithCarrier(label);
        },
      },
    );
  }

  private async refundWithCarrier(label: ShipmentLabelEntity): Promise<void> {
    try {
      await this.carrierParcelGateway.refundLabel({
        labelId: label.carrierLabelId || label.publicId,
      });
    }
    catch (error) {
      if (error instanceof CarrierLabelNotFoundError) {
        throw new ShipmentLabelNotFoundError();
      }

      if (error instanceof CarrierLabelAlreadyUsedError) {
        throw new ShipmentLabelUsedError();
      }

      if (error instanceof CarrierLabelRefundUnavailableError) {
        throw new CarrierLabelUnavailableError();
      }

      // A carrier that answers outside its own contract is still an outage; the
      // local label must not be voided without carrier evidence.
      throw new CarrierLabelUnavailableError();
    }
  }
}
