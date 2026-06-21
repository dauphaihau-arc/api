import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListPublicProductReviewImagesQueryDto } from './list-public-product-review-images.query.dto';

describe('ListPublicProductReviewImagesQueryDto', () => {
  it('accepts cursor pagination params', () => {
    const query = plainToInstance(ListPublicProductReviewImagesQueryDto, {
      limit: '8',
      cursor: 'cursor-1',
    });

    expect(validateSync(query)).toEqual([]);
    expect(query.limit).toBe(8);
    expect(query.cursor).toBe('cursor-1');
  });
});
