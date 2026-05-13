import { DomainError } from '~/common/errors/domain.error';

export abstract class CategoryAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class CategoryNotFoundError extends CategoryAppError {
  constructor() {
    super('Category was not found');
  }
}
