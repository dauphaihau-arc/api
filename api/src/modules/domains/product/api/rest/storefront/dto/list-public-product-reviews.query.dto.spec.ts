import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListPublicProductReviewsQueryDto } from './list-public-product-reviews.query.dto';

describe('ListPublicProductReviewsQueryDto', () => {
  it.each([
    ['all', 'newest'],
    ['most_recent', 'newest'],
    ['newest', 'newest'],
    ['highest_rating', 'highest_rating'],
    ['lowest_rating', 'lowest_rating'],
  ])('normalizes %s sort to %s', (input, expected) => {
    const query = plainToInstance(ListPublicProductReviewsQueryDto, {
      sort: input,
    });

    expect(validateSync(query)).toEqual([]);
    expect(query.sort).toBe(expected);
  });

  it('parses the review filters', () => {
    const query = plainToInstance(ListPublicProductReviewsQueryDto, {
      rating: '5',
      has_images: 'true',
      has_comment: '1',
    });

    expect(validateSync(query)).toEqual([]);
    expect(query.rating).toBe(5);
    expect(query.hasImages).toBe(true);
    expect(query.hasComment).toBe(true);
  });
});
