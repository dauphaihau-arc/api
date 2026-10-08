import {
  BadRequestException,
  Catch,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { ProductImportNotFoundError, ProductImportTemplateError } from '~/domains/product/app/product-import/product-import.errors';

/**
 * Maps Product Import errors raised while reading an uploaded workbook to the
 * import routes' HTTP contract.
 */
@Injectable()
@Catch()
export class ProductImportExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    if (exception instanceof ProductImportTemplateError) {
      return new BadRequestException({
        code: exception.code,
        message: exception.message,
      });
    }

    if (exception instanceof ProductImportNotFoundError) {
      return new NotFoundException(exception.message);
    }

    return null;
  }
}
