import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { CreateCheckoutQuoteFromCartDto } from './create-checkout-quote-from-cart.dto';

describe('CreateCheckoutQuoteFromCartDto', () => {
  it('maps presentment_currency into presentmentCurrency', () => {
    const dto = plainToInstance(CreateCheckoutQuoteFromCartDto, {
      user_address_id: '68c1687f-7979-4cf4-9230-2ea2436f2dad',
      presentment_currency: 'USD',
    });

    expect(dto.presentmentCurrency).toBe('USD');
  });
});
