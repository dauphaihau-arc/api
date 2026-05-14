import { ProductVariantType } from '../../src/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../src/modules/domains/product/domain/enums/product-who-made.enum';

export type ProductSeed = {
  shopName: string;
  categoryPath: string[];
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  variantType: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
  inventory: Array<{
    sku: string;
    stock: number;
    price: number;
    salePrice?: number;
    optionValue1?: string;
    optionValue2?: string;
  }>;
};

export const productSeeds: ProductSeed[] = [
  {
    shopName: 'Olive Atelier',
    categoryPath: ['Clothing', "Women's Fashion", 'Dresses'],
    title: 'Linen Weekend Dress',
    description:
      'Relaxed linen dress with a lightweight drape and clean everyday silhouette.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Color',
    inventory: [
      { sku: 'OA-DRESS-BLK', stock: 14, price: 82, salePrice: 74, optionValue1: 'Black' },
      { sku: 'OA-DRESS-RED', stock: 9, price: 82, optionValue1: 'Red' },
    ],
  },
  {
    shopName: 'Olive Atelier',
    categoryPath: ['Accessories', 'Bag', 'Totes'],
    title: 'Canvas Market Tote',
    description:
      'Structured carryall with reinforced straps sized for a daily market run.',
    whoMade: ProductWhoMade.COLLECTIVE,
    variantType: ProductVariantType.NONE,
    inventory: [{ sku: 'OA-TOTE-STD', stock: 21, price: 48 }],
  },
  {
    shopName: 'Reed Workshop',
    categoryPath: ['Clothing', 'Man Fashion', 'Hoodies'],
    title: 'Studio Pullover Hoodie',
    description:
      'Heavyweight hoodie built for cool mornings with a soft brushed interior.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.COMBINE,
    variantGroupName: 'Color',
    variantSubGroupName: 'Size',
    inventory: [
      { sku: 'RW-HOOD-BLK-S', stock: 6, price: 68, optionValue1: 'Black', optionValue2: 'S' },
      { sku: 'RW-HOOD-BLK-M', stock: 8, price: 68, optionValue1: 'Black', optionValue2: 'M' },
      { sku: 'RW-HOOD-RED-S', stock: 4, price: 68, salePrice: 61, optionValue1: 'Red', optionValue2: 'S' },
      { sku: 'RW-HOOD-RED-M', stock: 7, price: 68, optionValue1: 'Red', optionValue2: 'M' },
    ],
  },
  {
    shopName: 'Reed Workshop',
    categoryPath: ['Electronics', 'Headphones'],
    title: 'Walnut Desk Headphones Stand',
    description:
      'Hand-finished wood display stand designed to keep over-ear headphones organized.',
    whoMade: ProductWhoMade.SOMEONE_ELSE,
    variantType: ProductVariantType.NONE,
    inventory: [{ sku: 'RW-STAND-WAL', stock: 11, price: 36 }],
  },
  {
    shopName: 'Sage Studio',
    categoryPath: ['Art', 'Painting'],
    title: 'Minimal Horizon Print',
    description:
      'Archival print with a muted color palette and a wide matte-ready aspect ratio.',
    whoMade: ProductWhoMade.I_DID,
    variantType: ProductVariantType.NONE,
    inventory: [{ sku: 'SS-PRINT-HZN', stock: 17, price: 54 }],
  },
  {
    shopName: 'Sage Studio',
    categoryPath: ['Home', 'Furniture', 'Table'],
    title: 'Oak Side Table',
    description:
      'Compact side table with rounded edges and a natural oil finish for small spaces.',
    whoMade: ProductWhoMade.COLLECTIVE,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Finish',
    inventory: [
      { sku: 'SS-TABLE-OAK', stock: 3, price: 140, optionValue1: 'Oak' },
      { sku: 'SS-TABLE-WAL', stock: 2, price: 155, optionValue1: 'Walnut' },
    ],
  },
];
