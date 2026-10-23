import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { MikroOrmCommissionScheduleRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-commission-schedule.repository';
import { MikroOrmJournalEntryRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmSellerPayableCommandRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-seller-payable-command.repository';
import { MikroOrmSettlementCurrencyRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-settlement-currency.repository';
import { RecordOrderPaidJournalEntryUseCase } from '~/domains/finance/app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { FxRateService } from '~/integrations/currency/fx-rate.service';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import { DEFAULT_ROUNDING_POLICY_CONFIG } from '~/platform/config/rounding.config';
import { paidOrderMoneyEventKey } from '~/domains/finance/domain/rules/paid-order-postings';
import type { OrderPaidMoneyEvent } from '~/domains/finance/app/ports/order-paid-money-event';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

type PayablePositionRow = {
  currency: string;
  available_minor: number;
  not_yet_available_minor: number;
};

type BalancedEntryRow = {
  journal_entry_id: string;
  posting_count: number;
  total_minor: number;
};

/**
 * The Finance ledger seam, exercised without HTTP and without a Nest app: real
 * PostgreSQL, real repositories, real use case. The unique Money Event key and
 * the balanced Posting check are concurrency properties of this seam, which the
 * HTTP surface cannot exercise reliably.
 */
describe('Finance ledger concurrency (integration)', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;
  let owner: UserEntity;

  beforeAll(async () => {
    testDb = await createTestDatabase('finance_ledger_concurrency');
    orm = await MikroORM.init(
      buildDatabaseConfig(
        {
          ...process.env,
          DB_HOST: testDb.rootConfig.host,
          DB_PORT: String(testDb.rootConfig.port),
          DB_USER: testDb.rootConfig.user,
          DB_PASSWORD: testDb.rootConfig.password,
          DB_NAME: testDb.dbName,
        },
        { includeEntityGlobs: true },
      ),
    );

    const em = orm.em.fork();
    owner = em.create(UserEntity, {
      email: `owner-${randomUUID()}@example.com`,
      displayName: 'Owner',
      status: UserStatus.ACTIVE,
    });
    em.persist(owner);
    await em.flush();
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  async function seedShop(): Promise<string> {
    const em = orm.em.fork();
    const shop = em.create(ShopEntity, {
      ownerUser: em.getReference(UserEntity, owner.id),
      shopName: `Shop ${randomUUID()}`,
      slug: `shop-${randomUUID()}`,
      currency: 'USD',
    });
    em.persist(shop);
    await em.flush();

    return shop.id;
  }

  /**
   * A use case whose EntityManager is its own fork, so two of these race on
   * genuinely separate connections from MikroORM's pool rather than sharing one
   * identity map and one transaction.
   */
  function buildUseCase(): RecordOrderPaidJournalEntryUseCase {
    const entityManager: EntityManager = orm.em.fork();
    const moneyConversionService = new MoneyConversionService(
      new FxRateService(entityManager),
      new RoundingPolicyService(DEFAULT_ROUNDING_POLICY_CONFIG),
    );

    return new RecordOrderPaidJournalEntryUseCase(
      entityManager,
      new MikroOrmJournalEntryRepository(entityManager),
      new MikroOrmSellerPayableCommandRepository(entityManager),
      new MikroOrmCommissionScheduleRepository(entityManager),
      new MikroOrmSettlementCurrencyRepository(entityManager),
      moneyConversionService,
    );
  }

  function paidEvent(input: {
    orderId: string;
    shopId: string;
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
  }): OrderPaidMoneyEvent {
    return {
      orderId: input.orderId,
      orderPublicId: `order-${randomUUID()}`,
      shopId: input.shopId,
      currency: 'USD',
      subtotalMinor: input.subtotalMinor,
      discountMinor: input.discountMinor,
      shippingMinor: input.shippingMinor,
      totalMinor: input.subtotalMinor - input.discountMinor + input.shippingMinor,
      occurredAt: new Date().toISOString(),
    };
  }

  async function readPayablePosition(
    shopId: string,
  ): Promise<PayablePositionRow> {
    const rows = await orm.em.execute<PayablePositionRow[]>(
      `
        select currency, available_balance_minor as available_minor,
               pending_balance_minor as not_yet_available_minor
        from seller_payable_balances
        where shop_id = ?::uuid
      `,
      [shopId],
    );

    return rows[0];
  }

  it('records one Journal Entry and one credit for two concurrent deliveries of the same money event', async () => {
    const shopId = await seedShop();
    const event = paidEvent({
      orderId: randomUUID(),
      shopId,
      subtotalMinor: 2500,
      discountMinor: 0,
      shippingMinor: 500,
    });

    const results = await Promise.all([
      buildUseCase().execute(event),
      buildUseCase().execute(event),
    ]);

    // Exactly one delivery recorded; the replay lost the race and wrote nothing.
    expect(results.filter((result) => result.recorded)).toHaveLength(1);

    const entries = await orm.em.execute<Array<{ id: string }>>(
      'select id from journal_entries where money_event_key = ?',
      [paidOrderMoneyEventKey(event.orderId)],
    );
    expect(entries).toHaveLength(1);

    const postings = await orm.em.execute<Array<{ posting_count: number; total_minor: number }>>(
      `
        select count(*)::int as posting_count, coalesce(sum(amount_minor), 0)::int as total_minor
        from postings
        where journal_entry_id = ?::uuid
      `,
      [entries[0].id],
    );
    expect(postings[0]).toEqual({ posting_count: 2, total_minor: 0 });

    // The credit landed exactly once, not twice.
    expect(await readPayablePosition(shopId)).toEqual({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 3000,
    });
  });

  it('lands both concurrent credits for one shop', async () => {
    const shopId = await seedShop();
    const firstEvent = paidEvent({
      orderId: randomUUID(),
      shopId,
      subtotalMinor: 1000,
      discountMinor: 0,
      shippingMinor: 0,
    });
    const secondEvent = paidEvent({
      orderId: randomUUID(),
      shopId,
      subtotalMinor: 2500,
      discountMinor: 100,
      shippingMinor: 500,
    });

    const results = await Promise.all([
      buildUseCase().execute(firstEvent),
      buildUseCase().execute(secondEvent),
    ]);

    // Distinct money event keys: neither is a replay.
    expect(results).toEqual([
      { recorded: true },
      { recorded: true },
    ]);

    const entries = await orm.em.execute<Array<{ money_event_key: string }>>(
      `
        select money_event_key
        from journal_entries
        where money_event_key in (?, ?)
        order by money_event_key
      `,
      [
        paidOrderMoneyEventKey(firstEvent.orderId),
        paidOrderMoneyEventKey(secondEvent.orderId),
      ],
    );
    expect(entries).toHaveLength(2);

    // The upsert must add, not overwrite: 1000 + 2900.
    expect(await readPayablePosition(shopId)).toEqual({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 3900,
    });
  });

  it('keeps every recorded Journal Entry balanced at storage level', async () => {
    const shopId = await seedShop();
    const event = paidEvent({
      orderId: randomUUID(),
      shopId,
      subtotalMinor: 4200,
      discountMinor: 200,
      shippingMinor: 300,
    });

    await buildUseCase().execute(event);

    // Assert over raw storage: each entry has exactly two Postings summing to
    // zero. No test-only seam forces an unbalanced entry, so this proves the
    // invariant on what the production path actually wrote.
    const entries = await orm.em.execute<BalancedEntryRow[]>(
      `
        select
          je.id::text as journal_entry_id,
          count(p.id)::int as posting_count,
          coalesce(sum(p.amount_minor), 0)::int as total_minor
        from journal_entries je
        left join postings p on p.journal_entry_id = je.id
        group by je.id
        order by je.id
      `,
    );

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.posting_count).toBe(2);
      expect(entry.total_minor).toBe(0);
    }
  });
});
