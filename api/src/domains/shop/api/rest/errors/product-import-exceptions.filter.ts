import {
  BadRequestException,
  Catch,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { ProductImportNotFoundError, ProductImportTemplateError } from '~/domains/product/app/product-import/product-import.errors';

/**
 * Public UPPER_SNAKE_CASE code for each template failure the parser can raise.
 * The internal error keeps its lowercase identifier; only the wire code changes.
 */
const PRODUCT_IMPORT_TEMPLATE_PUBLIC_CODES: Record<string, string> = {
  missing_metadata_sheet: 'MISSING_METADATA_SHEET',
  unsupported_template_version: 'UNSUPPORTED_TEMPLATE_VERSION',
  missing_products_sheet: 'MISSING_PRODUCTS_SHEET',
  missing_headers: 'MISSING_HEADERS',
  too_many_rows: 'TOO_MANY_ROWS',
  duplicate_headers: 'DUPLICATE_HEADERS',
  missing_required_headers: 'MISSING_REQUIRED_HEADERS',
  formula_in_template: 'FORMULA_IN_TEMPLATE',
  missing_file: 'MISSING_FILE',
  file_too_large: 'FILE_TOO_LARGE',
  unsupported_file_type: 'UNSUPPORTED_FILE_TYPE',
};

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
        code: PRODUCT_IMPORT_TEMPLATE_PUBLIC_CODES[exception.code] ??
          'PRODUCT_IMPORT_TEMPLATE_INVALID',
        message: exception.message,
      });
    }

    if (exception instanceof ProductImportNotFoundError) {
      return new NotFoundException({
        code: 'PRODUCT_IMPORT_NOT_FOUND',
        message: exception.message,
      });
    }

    return null;
  }
}
