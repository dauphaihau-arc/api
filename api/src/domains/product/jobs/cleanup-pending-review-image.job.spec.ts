import { CleanupPendingReviewImageJob } from './cleanup-pending-review-image.job';

describe('CleanupPendingReviewImageJob', () => {
  it('deletes and clears a still-pending review image', async () => {
    const pendingReviewImageUploadService = {
      getPending: jest.fn().mockResolvedValue({
        orderItemId: 'item-1',
        userId: 'user-1',
        storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/img/original.jpg',
      }),
      clearPending: jest.fn().mockResolvedValue(undefined),
    };
    const storageService = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    const job = new CleanupPendingReviewImageJob(
      pendingReviewImageUploadService as never,
      storageService as never,
    );

    await job.run({
      storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/img/original.jpg',
    });

    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'dev/public/users/user-1/products/item-1/images/product-reviews/img/original.jpg',
    );
    expect(pendingReviewImageUploadService.clearPending).toHaveBeenCalled();
  });

  it('does nothing when the upload is already cleared', async () => {
    const pendingReviewImageUploadService = {
      getPending: jest.fn().mockResolvedValue(undefined),
      clearPending: jest.fn(),
    };
    const storageService = {
      deleteObject: jest.fn(),
    };

    const job = new CleanupPendingReviewImageJob(
      pendingReviewImageUploadService as never,
      storageService as never,
    );

    await job.run({
      storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/img/original.jpg',
    });

    expect(storageService.deleteObject).not.toHaveBeenCalled();
    expect(pendingReviewImageUploadService.clearPending).not.toHaveBeenCalled();
  });
});
