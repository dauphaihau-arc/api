import { Client } from 'pg';
import { Migration20261007150000_backfill_checkout_snapshot_public_refs } from '../../database/migrations/Migration20261007150000_backfill_checkout_snapshot_public_refs';
import { parsePricedShops } from '../../src/domains/checkout/app/services/checkout-quote-priced-shops';
import { parsePersistedShippingDiscount, toPublicShippingDiscount } from '../../src/domains/checkout/app/checkout-shipping-snapshot.contract';

jest.setTimeout(30_000);

describe('checkout snapshot public reference backfill', () => {
  let sql: Client;
  afterEach(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('adds public references without changing accepted money or historical product scope', async () => {
    sql = new Client({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'postgres',
    });
    await sql.connect();
    await sql.query(`
      create temporary table shops (id text, public_id text);
      create temporary table products (id text, public_id text);
      create temporary table promotions (id text, public_id text);
      create temporary table checkout_quotes (priced_shops jsonb, expires_at timestamptz);
      create temporary table orders (shipping_quote_snapshot jsonb);
      insert into shops values ('shop-internal', 'shop_public');
      insert into products values ('product-selected', 'prod_selected'), ('product-other', 'prod_other');
      insert into promotions values ('promotion-internal', 'prm_public');
    `);
    const discount = {
      promotion_id: 'promotion-internal',
      product_ids: ['product-other', 'product-selected'],
      code: 'FREE',
      benefit_type: 'free_shipping',
      product_scope: 'specific',
      min_order_type: 'none',
      min_order_value: 0,
      min_purchase_quantity: 0,
      max_redemptions: 0,
      max_redemptions_per_buyer: 0,
      redemption_count: 3,
      waived_minor: 500,
      currency: 'USD',
    };
    const shop = {
      shop_id: 'shop-internal',
      shop_name: 'Shop',
      shop_slug: 'shop',
      subtotal_minor: 2000,
      discount_minor: 0,
      shipping_minor: 0,
      total_minor: 2000,
      shipping_discounts: [discount],
      items: [{
        product_id: 'product-selected',
        inventory_id: 'inventory',
        shop_id: 'shop-internal',
        title: 'Historical title',
        quantity: 1,
        unit_price_minor: 2000,
        line_total_minor: 2000,
        currency: 'USD',
      }],
    };
    const orderSnapshot = { shipping: { immutable: 'accepted shipping facts' }, shipping_discount_minor: 500, shipping_discounts: [discount] };
    await sql.query('insert into checkout_quotes values ($1::jsonb, current_timestamp + interval \'1 hour\')', [JSON.stringify([shop])]);
    await sql.query('insert into orders values ($1::jsonb)', [JSON.stringify(orderSnapshot)]);
    const statements: string[] = [];
    await Migration20261007150000_backfill_checkout_snapshot_public_refs.prototype.up.call({
      addSql: (statement: string) => statements.push(statement),
    } as never);
    for (const statement of statements) await sql.query(statement);
    const quote = (await sql.query('select priced_shops from checkout_quotes')).rows[0].priced_shops;
    const order = (await sql.query('select shipping_quote_snapshot from orders')).rows[0].shipping_quote_snapshot;
    expect(quote[0]).toMatchObject({ ...shop, shop_public_id: 'shop_public' });
    expect(quote[0].items[0]).toMatchObject({ product_public_id: 'prod_selected', shop_public_id: 'shop_public' });
    expect(order.shipping).toEqual(orderSnapshot.shipping);
    expect(order.shipping_discount_minor).toBe(500);
    const parsed = parsePricedShops(quote);
    expect(parsed[0]!.items[0]!.productPublicId).toBe('prod_selected');
    expect(toPublicShippingDiscount(parsed[0]!.shippingDiscounts[0]!)).toMatchObject({
      promotion_id: 'prm_public', product_ids: ['prod_other', 'prod_selected'], waived_minor: 500,
    });
    // Discount parsing is shared by the order and quote read boundaries.
    expect(order.shipping_discounts).toEqual(quote[0].shipping_discounts);
    expect(toPublicShippingDiscount(parsePersistedShippingDiscount(order.shipping_discounts[0]))).toMatchObject({
      promotion_id: 'prm_public', product_ids: ['prod_other', 'prod_selected'], waived_minor: 500,
    });
  });
});
