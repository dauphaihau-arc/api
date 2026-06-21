import type { HttpException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { CategoryAppError } from '../../app/errors/category-app.error';
import { CategoryNotFoundError } from '../../app/errors/category-app.error';

export function mapCategoryAppErrorToHttpException(
  error: CategoryAppError,
): HttpException {
  if (error instanceof CategoryNotFoundError) {
    return new NotFoundException(error.message);
  }

  return new NotFoundException(error.message);
}
