import { ProductDraftIncompleteError, ProductNotFoundError } from '~/domains/product/app/errors/product-app.error';
import { mapProductAppErrorToHttpException } from './product-http-error-mapper';

describe('product HTTP public references', () => {
  it('returns the public Product reference when a created draft is incomplete', () => {
    const exception = mapProductAppErrorToHttpException(new ProductDraftIncompleteError(
      'internal-product-id',
      'shipping',
      'Product "internal-product-id" was not found',
      'prod_000000000001',
    ));

    expect(exception.getStatus()).toBe(422);
    expect(exception.getResponse()).toMatchObject({
      product_id: 'prod_000000000001',
      message: 'Product "prod_000000000001" was not found',
      failed_step: 'shipping',
    });
  });

  it('does not expose an internal Product reference in not-found errors', () => {
    const exception = mapProductAppErrorToHttpException(new ProductNotFoundError('internal-product-id'));

    expect(exception.getStatus()).toBe(404);
    expect(exception.getResponse()).toMatchObject({ message: 'Product was not found' });
  });
});
