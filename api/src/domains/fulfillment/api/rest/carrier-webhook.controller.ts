import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { internalServerErrorExample } from '~/platform/http/api-error-examples';
import { RecordCarrierEventUseCase } from '../../app/use-cases/record-carrier-event/record-carrier-event.use-case';
import { CarrierWebhookEventDto } from './dto/carrier-webhook-event.dto';
import { FulfillmentExceptionsFilter } from './errors/fulfillment-exceptions.filter';
import { CarrierWebhookAckResponseDto } from './responses/carrier-webhook.response';

const CARRIER_SIGNATURE_HEADER = 'x-carrier-signature';
const CARRIER_SIGNATURE_PREFIX = 'sha256=';

/**
 * Unauthenticated-but-signed carrier ingress. The signature is checked against
 * the exact wire body before any command runs; an unknown tracking number and
 * a repeated event are acknowledged so a carrier does not retry them.
 */
@Controller('webhooks/carrier')
@UseFilters(FulfillmentExceptionsFilter)
@SkipThrottle()
@ApiTags('Carrier Webhooks')
@ApiErrorResponses({
  400: [
    {
      code: 'INVALID_CARRIER_EVENT',
      message: 'Carrier event code is not supported',
    },
    { code: 'VALIDATION_FAILED', message: 'Validation failed' },
  ],
  401: [
    {
      code: 'INVALID_CARRIER_SIGNATURE',
      message: 'Carrier webhook signature is missing or invalid',
    },
  ],
  500: [internalServerErrorExample],
})
export class CarrierWebhookController {
  constructor(
    private readonly recordCarrierEventUseCase: RecordCarrierEventUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle a signed carrier event' })
  @ApiHeader({
    name: CARRIER_SIGNATURE_HEADER,
    required: true,
    description:
      'HMAC-SHA256 of the raw request body with the carrier webhook secret, as `sha256=<hex>` or `<hex>`.',
  })
  @ApiOkResponse({
    description: 'Event accepted, duplicated, or ignored; the body is always an empty object.',
    type: CarrierWebhookAckResponseDto,
  })
  async handle(
    @Req() request: Request & { rawBody?: Buffer },
    @Body() body: CarrierWebhookEventDto,
    @Headers(CARRIER_SIGNATURE_HEADER) signature?: string,
  ): Promise<CarrierWebhookAckResponseDto> {
    const secret = this.configService.get<string>('CARRIER_WEBHOOK_SECRET');
    // The integration harness runs without the production raw-body middleware,
    // so the parsed body is the exact JSON the carrier signed there.
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));

    if (!secret || !hasValidSignature(secret, rawBody, signature)) {
      throw new UnauthorizedException({
        code: 'INVALID_CARRIER_SIGNATURE',
        message: 'Carrier webhook signature is missing or invalid',
      });
    }

    await this.recordCarrierEventUseCase.execute({
      eventId: body.eventId,
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
      eventCode: body.eventCode,
      location: body.location,
      occurredAt: new Date(body.occurredAt),
      rawBody: rawBody.toString('utf8'),
    });

    return {};
  }
}

function hasValidSignature(
  secret: string,
  rawBody: Buffer,
  signature?: string,
): boolean {
  const provided = parseSignature(signature);

  if (!provided) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest();

  return timingSafeEqual(expected, provided);
}

function parseSignature(signature?: string): Buffer | undefined {
  if (!signature) {
    return undefined;
  }

  const trimmed = signature.trim();
  const hex = trimmed.toLowerCase().startsWith(CARRIER_SIGNATURE_PREFIX)
    ? trimmed.slice(CARRIER_SIGNATURE_PREFIX.length)
    : trimmed;

  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    return undefined;
  }

  return Buffer.from(hex, 'hex');
}
