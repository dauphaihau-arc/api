import { SetMetadata } from '@nestjs/common';
import {
  IDEMPOTENCY_OPTIONS,
  type IdempotencyOptions
} from '../interceptors/idempotency.constants';

export function Idempotent(options: IdempotencyOptions): MethodDecorator {
  return SetMetadata(IDEMPOTENCY_OPTIONS, options);
}
