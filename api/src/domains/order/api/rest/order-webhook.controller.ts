import {
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentGateway } from '~/integrations/payment/app/ports/payment-gateway';
import { HandleStripeWebhookUseCase } from '../../app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';

@Controller('webhooks/stripe')
@ApiTags('Stripe Webhooks')
export class OrderWebhookController {
  constructor(
    private readonly paymentGateway: PaymentGateway,
    private readonly handleStripeWebhookUseCase: HandleStripeWebhookUseCase,
  ) {}

  @Post()
  @SkipThrottle()
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiHeader({
    name: 'stripe-signature',
    required: false,
    description: 'Stripe webhook signature header.',
  })
  @ApiOkResponse({
    description: 'Webhook accepted.',
    schema: { type: 'object' },
  })
  async handle(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const event = this.paymentGateway.constructWebhookEvent(
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      signature,
    );

    await this.handleStripeWebhookUseCase.execute(event);

    return {};
  }
}
