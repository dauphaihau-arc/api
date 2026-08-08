import * as XLSX from 'xlsx';
import { ProductWhoMade } from '../../domain/enums/product-who-made.enum';
import {
  PRODUCT_IMPORT_METADATA_SHEET,
  PRODUCT_IMPORT_PRODUCTS_SHEET,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
} from './product-import.constants';
import { ProductImportTemplateError } from './product-import.errors';
import { parseProductImportWorkbook } from './product-import-parser';
import { buildProductImportTemplateWorkbook } from './product-import-template';

describe('product import XLSX parser', () => {
  it('parses the backend-generated template workbook', () => {
    const workbook = parseProductImportWorkbook(buildProductImportTemplateWorkbook());

    expect(workbook.templateVersion).toBe(PRODUCT_IMPORT_TEMPLATE_VERSION);
    expect(workbook.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        title: 'Classic cotton tote',
        description: 'A sturdy everyday cotton tote bag.',
        categoryPath: 'Fashion > Man Fashion > Tees',
        price: 24.99,
        originalPrice: 29.99,
        stock: 25,
        sku: 'TOTE-001',
        isDigital: false,
        whoMade: ProductWhoMade.I_DID,
        nonTaxable: false,
        formulaColumns: [],
        invalidColumns: [],
      }),
    ]);
  });

  it('rejects workbooks missing required headers', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['template_version', PRODUCT_IMPORT_TEMPLATE_VERSION],
    ]), PRODUCT_IMPORT_METADATA_SHEET);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['title', 'price'],
      ['Missing headers', 10],
    ]), PRODUCT_IMPORT_PRODUCTS_SHEET);

    expect(() => parseProductImportWorkbook(writeWorkbook(workbook))).toThrow(
      ProductImportTemplateError,
    );
  });

  it('marks formula cells on product rows for row-level validation', () => {
    const workbook = XLSX.utils.book_new();
    const products = XLSX.utils.aoa_to_sheet([
      ['title', 'description', 'category_path', 'price', 'stock'],
      ['Formula price', 'Description', 'Accessories > Bags', 0, 3],
    ]);
    /* eslint-disable id-length -- SheetJS cell objects use t/v/f field names. */
    products.D2 = {
      t: 'n',
      v: 10,
      f: '5+5',
    };
    /* eslint-enable id-length */

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['template_version', PRODUCT_IMPORT_TEMPLATE_VERSION],
    ]), PRODUCT_IMPORT_METADATA_SHEET);
    XLSX.utils.book_append_sheet(workbook, products, PRODUCT_IMPORT_PRODUCTS_SHEET);

    const parsed = parseProductImportWorkbook(writeWorkbook(workbook));

    expect(parsed.rows[0]?.formulaColumns).toEqual(['price']);
  });

  it('keeps invalid optional enum and boolean cells for row-level validation', () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['template_version', PRODUCT_IMPORT_TEMPLATE_VERSION],
    ]), PRODUCT_IMPORT_METADATA_SHEET);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['title', 'description', 'category_path', 'price', 'stock', 'is_digital', 'who_made'],
      ['Invalid optionals', 'Description', 'Accessories > Bags', 10, 3, 'maybe', 'artist'],
    ]), PRODUCT_IMPORT_PRODUCTS_SHEET);

    const parsed = parseProductImportWorkbook(writeWorkbook(workbook));

    expect(parsed.rows[0]?.invalidColumns).toEqual(['is_digital', 'who_made']);
  });
});

function writeWorkbook(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
}
