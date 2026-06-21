import type { Cache } from 'cache-manager';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConsumeReviewImageUploadTicketUseCase } from './consume-review-image-upload-ticket.use-case';

describe('ConsumeReviewImageUploadTicketUseCase', () => {
  it('rejects review images larger than the configured limit', async () => {
    const cacheManager = {
      get: jest.fn().mockResolvedValue({
        storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/img/original.jpg',
      }),
      del: jest.fn(),
    } as unknown as Cache;

    const storageService = {
      putObject: jest.fn(),
    };

    const useCase = new ConsumeReviewImageUploadTicketUseCase(
      cacheManager,
      storageService as never,
      { driver: 'local' } as never,
    );

    await expect(
      useCase.execute(
        'token-1',
        Buffer.alloc((8 * 1024 * 1024) + 1),
        'image/jpeg',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing upload tickets', async () => {
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      del: jest.fn(),
    } as unknown as Cache;

    const useCase = new ConsumeReviewImageUploadTicketUseCase(
      cacheManager,
      { putObject: jest.fn() } as never,
      { driver: 'local' } as never,
    );

    await expect(
      useCase.execute('missing', Buffer.from('abc'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
