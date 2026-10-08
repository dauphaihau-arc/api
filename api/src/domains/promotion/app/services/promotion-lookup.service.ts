import { Injectable, NotFoundException } from '@nestjs/common';
import { PromotionRepository } from '../ports/promotion.repository';

@Injectable()
export class PromotionLookupService {
  constructor(private readonly repository: PromotionRepository) {}
  async resolvePromotionPublicId(publicId: string): Promise<string> {
    const result = await this.repository.findByPublicId(publicId);
    if (!result) throw new NotFoundException('Promotion was not found');
    return result.id;
  }
  async resolvePromotionPublicIds(publicIds: readonly string[]): Promise<readonly (string | null)[]> {
    if (!publicIds.length) return [];
    const results = await this.repository.findByPublicIds(publicIds);
    return results.map((result) => result?.id ?? null);
  }
}
