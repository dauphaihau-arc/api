import {
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import { HandleStripeWebhookUseCase } from '../../app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';

@Controller('webhooks/stripe')
export class OrderWebhookController {
  constructor(
    private readonly paymentGateway: PaymentGateway,
    private readonly handleStripeWebhookUseCase: HandleStripeWebhookUseCase
  ) {}

  @Post()
  async handle(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string
  ) {
    const event = this.paymentGateway.constructStripeWebhookEvent(
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      signature
    );

    await this.handleStripeWebhookUseCase.execute(event);

    return {};
  }
}
