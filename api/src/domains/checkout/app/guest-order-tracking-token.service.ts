import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { parseDurationToMilliseconds } from '~/shared/libs/duration';

type GuestOrderTrackingTokenPayload = {
  ['v']: 1;
  exp: number;
} & (
  | { sessionId: string }
  | { email: string; orderIds: string[] }
);

export type ResolvedGuestOrderTrackingLink =
  | { sessionId: string }
  | { email: string; orderIds: string[] };

@Injectable()
export class GuestOrderTrackingTokenService {
  constructor(private readonly configService: ConfigService) {}

  issue(input: ResolvedGuestOrderTrackingLink): string {
    const payload: GuestOrderTrackingTokenPayload = 'sessionId' in input
      ? {
        ['v']: 1,
        exp: Date.now() + this.getTokenTtlInMilliseconds(),
        sessionId: input.sessionId,
      }
      : {
        ['v']: 1,
        exp: Date.now() + this.getTokenTtlInMilliseconds(),
        email: input.email.trim().toLowerCase(),
        orderIds: input.orderIds.map((value) => value.trim()).filter(Boolean),
      };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  resolve(token: string): ResolvedGuestOrderTrackingLink {
    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      throw new BadRequestException('Invalid or expired guest tracking link');
    }

    const expectedSignature = this.sign(encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedSignatureBuffer.length
      || !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
      throw new BadRequestException('Invalid or expired guest tracking link');
    }

    let payload: unknown;

    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
    }
    catch {
      throw new BadRequestException('Invalid or expired guest tracking link');
    }

    if (!this.isValidPayload(payload)) {
      throw new BadRequestException('Invalid or expired guest tracking link');
    }

    if (payload.exp <= Date.now()) {
      throw new BadRequestException('Guest tracking link has expired');
    }

    if ('sessionId' in payload) {
      return { sessionId: payload.sessionId };
    }

    return {
      email: payload.email,
      orderIds: payload.orderIds,
    };
  }

  private sign(value: string): string {
    return createHmac('sha256', this.getSecret())
      .update(value)
      .digest('base64url');
  }

  private getSecret(): string {
    return this.configService.get<string>('GUEST_ORDER_TRACKING_SECRET')
      ?.trim()
      || this.configService.getOrThrow<string>('JWT_ACCESS_SECRET').trim();
  }

  private getTokenTtlInMilliseconds(): number {
    return parseDurationToMilliseconds(
      this.configService.get<string>('GUEST_ORDER_TRACKING_TTL'),
      ms('30d'),
    );
  }

  private isValidPayload(
    value: unknown,
  ): value is GuestOrderTrackingTokenPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    if (!('v' in value) || value['v'] !== 1 || !('exp' in value) || typeof value.exp !== 'number') {
      return false;
    }

    if ('sessionId' in value && typeof value.sessionId === 'string' && value.sessionId.trim()) {
      return true;
    }

    return (
      'email' in value
      && typeof value.email === 'string'
      && value.email.trim().length > 0
      && 'orderIds' in value
      && Array.isArray(value.orderIds)
      && value.orderIds.every(
        (orderId) => typeof orderId === 'string' && orderId.trim().length > 0,
      )
      && value.orderIds.length > 0
    );
  }
}
