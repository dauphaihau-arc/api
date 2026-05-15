import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import { OrderPaymentService } from '../../order-payment.service';

@Injectable()
export class GetOrdersByCheckoutSessionUseCase {
  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly paymentGateway: PaymentGateway
  ) {}

  async execute(sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('session_id is required');
    }

    let result = await this.orderPaymentService.getOrdersByCheckoutSession(sessionId);

    if (result.orderShops.length === 0) {
      throw new NotFoundException('Checkout session not found');
    }

    const session = await this.paymentGateway.retrieveStripeCheckoutSession(sessionId);

    if (session.payment_status === 'paid') {
      await this.orderPaymentService.markCheckoutSessionCompleted(sessionId, {
        paymentIntentId: session.payment_intent?.toString(),
        paymentStatus: session.payment_status,
        completedAt: new Date(),
      });
      result = await this.orderPaymentService.getOrdersByCheckoutSession(sessionId);
    }

    if (session.status === 'expired') {
      await this.orderPaymentService.markCheckoutSessionExpired(
        sessionId,
        session.expires_at ? new Date(session.expires_at * 1000) : undefined
      );
      throw new NotFoundException('Checkout session expired');
    }

    return result;
  }
}
