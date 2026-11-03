import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { GetSettlementCurrencyUseCase } from '~/domains/finance/app/use-cases/get-settlement-currency/get-settlement-currency.use-case';
import { RecordLabelMoneyEventUseCase } from '~/domains/finance/app/use-cases/record-label-money-event/record-label-money-event.use-case';
import {
  FINANCE_CONFIG,
  type FinanceConfig,
} from '~/platform/config/finance.config';
import { createPublicId } from '~/platform/ids/public-id';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import {
  CarrierLabelPurchaseUnavailableError,
  CarrierLabelQuoteRejectedError,
  CarrierParcelGateway,
  type CarrierPurchasedLabel,
} from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import {
  CarrierLabelUnavailableError,
  RateQuoteExpiredError,
} from '../../errors/fulfillment-app.error';
import { buildLabelMoneyEvent } from '../../events/label-money-event';
import type { FulfillmentCommandResult } from '../../services/fulfillment-command.runner';
import { FulfillmentCommandRunner } from '../../services/fulfillment-command.runner';
import { LabelMoneyEventOutboxService } from '../../services/label-money-event-outbox.service';
import { FulfillmentService } from '../../services/fulfillment.service';

export type PurchaseFulfillmentLabelCommand = {
  quoteId: string;
  groupId?: string;
  items: Array<{ orderItemId: string; quantity: number }>;
};

/**
 * Buys the carrier's label for a quote, stores its PDF, and prepares the
 * Shipment the label travels with. The purchase and the upload happen before
 * any local write, so a refused quote or a missing carrier leaves no partial
 * Shipment behind; the Shipment, its items, the seller's "Label purchased"
 * update, and the label row then commit in one transaction.
 */
@Injectable()
export class PurchaseFulfillmentLabelUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
    private readonly carrierParcelGateway: CarrierParcelGateway,
    private readonly storageService: StorageService,
    private readonly entityManager: EntityManager,
    private readonly getSettlementCurrency: GetSettlementCurrencyUseCase,
    private readonly labelMoneyEventOutboxService: LabelMoneyEventOutboxService,
    private readonly recordLabelMoneyEventUseCase: RecordLabelMoneyEventUseCase,
    @Inject(FINANCE_CONFIG) private readonly financeConfig: FinanceConfig,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    actorId: string,
    input: PurchaseFulfillmentLabelCommand,
  ): Promise<FulfillmentCommandResult> {
    let purchased: CarrierPurchasedLabel | undefined;
    let labelPublicId: string | undefined;
    let pdfStorageKey: string | undefined;

    try {
      return await this.commandRunner.execute(
        shopId,
        orderId,
        async (context, entityManager) => {
          if (!purchased || !labelPublicId || !pdfStorageKey) {
            throw new CarrierLabelUnavailableError();
          }

          const shipment = await this.fulfillmentService.prepareShipment(entityManager, {
            orderId: context.id,
            shopId: context.shopId,
            groupId: input.groupId,
            items: input.items,
            carrier: purchased.carrier,
            trackingNumber: purchased.trackingNumber,
            note: 'Label purchased',
            originCountries: context.originCountries,
            actor: {
              actorType: ShipmentUpdateActorType.SELLER,
              actorId,
              source: ShipmentUpdateSource.SELLER,
            },
          });

          await this.fulfillmentService.recordShipmentLabel(entityManager, {
            shipment,
            publicId: labelPublicId,
            quoteId: purchased.quoteId,
            carrierLabelId: purchased.labelId,
            carrier: purchased.carrier,
            service: purchased.service,
            trackingNumber: purchased.trackingNumber,
            priceMinor: purchased.priceMinor,
            currency: purchased.currency,
            pdfStorageKey,
          });

          // The seller paid for postage: book it in the same transaction that
          // records the label, so a label can never exist without its charge.
          const occurredAt = new Date();
          const labelChargeInput = {
            labelId: labelPublicId,
            shopId: context.shopId,
            orderId: context.id,
            amountMinor: purchased.priceMinor,
            currency: purchased.currency,
            occurredAt,
          };

          const labelChargedOutboxEvent =
            await this.labelMoneyEventOutboxService.createLabelChargedEvent(
              entityManager,
              labelChargeInput,
            );

          // `inline` books the charge inside the producer's transaction, so a
          // booking failure rolls the label back and the caller's compensation
          // refunds the carrier. The outbox row is kept and marked processed as
          // evidence, and the worker skips it.
          if (this.financeConfig.moneyEventBooking === 'inline') {
            await this.recordLabelMoneyEventUseCase.recordWithin(
              entityManager,
              buildLabelMoneyEvent(labelChargeInput),
              'charged',
            );
            labelChargedOutboxEvent.status = OutboxEventStatus.PROCESSED;
            labelChargedOutboxEvent.processedAt = occurredAt;
            await entityManager.flush();
          }
        },
        {
          beforeTransaction: async (context) => {
            // Reject an impossible parcel before the carrier charges for it, and
            // bind the quote to this shop's Settlement Currency.
            await this.fulfillmentService.assertPreparable(
              this.entityManager.fork(),
              {
                orderId: context.id,
                groupId: input.groupId,
                items: input.items,
              },
              { lock: false },
            );
            const { currency } = await this.getSettlementCurrency.execute({
              shopId: context.shopId,
            });

            purchased = await this.purchase(input.quoteId, currency);
            labelPublicId = createPublicId('lbl');
            pdfStorageKey = `labels/${context.shopId}/${labelPublicId}.pdf`;

            await this.storageService.putObject({
              key: pdfStorageKey,
              body: purchased.pdf,
              contentType: 'application/pdf',
              contentLength: purchased.pdf.length,
            });
          },
        },
      );
    }
    catch (error) {
      // The local transaction failed after the carrier charged for the label:
      // give the postage back and drop the uploaded artifact.
      if (purchased && labelPublicId) {
        await this.carrierParcelGateway
          .refundLabel({ labelId: purchased.labelId })
          .catch(() => undefined);
        await this.storageService
          .deleteObject(pdfStorageKey ?? `labels/${shopId}/${labelPublicId}.pdf`)
          .catch(() => undefined);
      }

      throw error;
    }
  }

  /**
   * Carrier refusals are contract-level, not transport-level: a quote that is
   * unknown, expired, or already used always means "request new rates", while
   * an outage means "try again later".
   */
  private async purchase(quoteId: string, currency: string): Promise<CarrierPurchasedLabel> {
    try {
      return await this.carrierParcelGateway.purchaseLabel({ quoteId, currency });
    }
    catch (error) {
      if (error instanceof CarrierLabelQuoteRejectedError) {
        throw new RateQuoteExpiredError();
      }

      if (error instanceof CarrierLabelPurchaseUnavailableError) {
        throw new CarrierLabelUnavailableError();
      }

      throw error;
    }
  }
}
