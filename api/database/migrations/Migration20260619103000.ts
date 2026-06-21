import { Migration } from '@mikro-orm/migrations';

export class Migration20260619103000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      delete from "product_reviews"
      where "id" in (
        select "id"
        from (
          select
            "id",
            row_number() over (
              partition by "user_id", "product_id"
              order by "updated_at" desc, "created_at" desc, "id" desc
            ) as "row_num"
          from "product_reviews"
        ) ranked_reviews
        where ranked_reviews."row_num" > 1
      );
    `);
    this.addSql(`
      drop index if exists "product_reviews_order_item_id_unique";
    `);
    this.addSql(`
      create unique index "product_reviews_user_id_product_id_unique"
      on "product_reviews" ("user_id", "product_id");
    `);
    this.addSql(`
      update "products" p
      set
        "review_count" = coalesce(aggregates."review_count", 0),
        "rating_average" = coalesce(aggregates."rating_average", 0)
      from (
        select
          "product_id",
          count(*)::int as "review_count",
          coalesce(avg("rating"), 0)::numeric(10,2) as "rating_average"
        from "product_reviews"
        where "status" = 'published'
        group by "product_id"
      ) aggregates
      where p."id" = aggregates."product_id";
    `);
    this.addSql(`
      update "products"
      set
        "review_count" = 0,
        "rating_average" = 0
      where "id" not in (
        select distinct "product_id"
        from "product_reviews"
        where "status" = 'published'
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop index if exists "product_reviews_user_id_product_id_unique";
    `);
    this.addSql(`
      create unique index "product_reviews_order_item_id_unique"
      on "product_reviews" ("order_item_id");
    `);
  }
}
