import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../app/ports/category.repository';
import { CategoryCommandRepository } from '../app/ports/category-command.repository';
import { CategoryQueryRepository } from '../app/ports/category-query.repository';
import type {
  CategorySuggestion,
  CategorySummary,
  CreateCategoryAttributeInput,
  CreateCategoryInput
} from '../app/category.types';

@Injectable()
export class DelegatingCategoryRepository implements CategoryRepository {
  constructor(
    private readonly commandRepository: CategoryCommandRepository,
    private readonly queryRepository: CategoryQueryRepository
  ) {}

  create(input: CreateCategoryInput): Promise<CategorySummary> {
    return this.commandRepository.create(input);
  }

  createAttribute(
    input: CreateCategoryAttributeInput
  ): Promise<CategorySummary | null> {
    return this.commandRepository.createAttribute(input);
  }

  findAllByParentId(parentId?: string): Promise<CategorySummary[]> {
    return this.queryRepository.findAllByParentId(parentId);
  }

  findById(id: string): Promise<CategorySummary | null> {
    return this.queryRepository.findById(id);
  }

  searchSuggestions(name: string, limit: number): Promise<CategorySuggestion[]> {
    return this.queryRepository.searchSuggestions(name, limit);
  }
}
