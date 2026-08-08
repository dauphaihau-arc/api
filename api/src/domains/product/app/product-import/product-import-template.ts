import * as XLSX from 'xlsx';
import { ProductWhoMade } from '../../domain/enums/product-who-made.enum';
import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_INSTRUCTIONS_SHEET,
  PRODUCT_IMPORT_METADATA_SHEET,
  PRODUCT_IMPORT_PRODUCTS_SHEET,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
} from './product-import.constants';

export function buildProductImportTemplateWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new();

  const metadata = XLSX.utils.aoa_to_sheet([
    ['template_version', PRODUCT_IMPORT_TEMPLATE_VERSION],
  ]);

  const products = XLSX.utils.aoa_to_sheet([
    [...PRODUCT_IMPORT_COLUMNS],
    [
      'Classic cotton tote',
      'A sturdy everyday cotton tote bag.',
      'Fashion > Man Fashion > Tees',
      24.99,
      25,
      'TOTE-001',
      29.99,
      'no',
      ProductWhoMade.I_DID,
      'no',
    ],
  ]);

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Field', 'Rule'],
    ['template_version', PRODUCT_IMPORT_TEMPLATE_VERSION],
    ['category_path', 'Existing category path, for example Fashion > Man Fashion > Tees'],
    ['price', 'Numeric shop-currency major units. Do not include currency symbols.'],
    ['stock', 'Whole number greater than or equal to 0.'],
    ['who_made', Object.values(ProductWhoMade).join(', ')],
    ['booleans', 'yes, no, true, false'],
  ]);

  XLSX.utils.book_append_sheet(workbook, metadata, PRODUCT_IMPORT_METADATA_SHEET);
  XLSX.utils.book_append_sheet(workbook, products, PRODUCT_IMPORT_PRODUCTS_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructions, PRODUCT_IMPORT_INSTRUCTIONS_SHEET);

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
}
