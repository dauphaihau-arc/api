import { Injectable } from '@nestjs/common';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

@Injectable()
export class RoundingPolicyService {
  toMinorUnits(amountMajor: number, currency: string): number {
    const scale = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
    return Math.round(amountMajor * scale);
  }
}
