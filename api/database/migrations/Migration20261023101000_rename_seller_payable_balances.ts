import { Migration } from '@mikro-orm/migrations';

export class Migration20261023101000_rename_seller_payable_balances extends Migration {
  override async up(): Promise<void> {
    // The store holds a projected balance, not a trading position. Existing
    // index and constraint names keep their historical spelling; a rename is
    // not a reason to churn them.
    this.addSql(`
      alter table "seller_payable_positions"
        rename to "seller_payable_balances";
    `);

    // The columns name the two halves of the balance itself. The API keeps its
    // `available_minor` / `not_yet_available_minor` payload, mapped in the
    // Seller Payable response layer.
    this.addSql(`
      alter table "seller_payable_balances"
        rename column "available_minor" to "available_balance_minor";
    `);
    this.addSql(`
      alter table "seller_payable_balances"
        rename column "not_yet_available_minor" to "pending_balance_minor";
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "seller_payable_balances"
        rename column "available_balance_minor" to "available_minor";
    `);
    this.addSql(`
      alter table "seller_payable_balances"
        rename column "pending_balance_minor" to "not_yet_available_minor";
    `);

    this.addSql(`
      alter table "seller_payable_balances"
        rename to "seller_payable_positions";
    `);
  }
}
