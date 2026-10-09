import type { HttpException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { CategoryAppError } from '../../../app/errors/category-app.error';
import { CategoryNotFoundError } from '../../../app/errors/category-app.error';

export function mapCategoryAppErrorToHttpException(
  error: CategoryAppError,
): HttpException {
  if (error instanceof CategoryNotFoundError) {
    return new NotFoundException({
      code: 'CATEGORY_NOT_FOUND',
      message: error.message,
    });
  }

  return new NotFoundException({
    code: 'CATEGORY_NOT_FOUND',
    message: error.message,
  });
}
