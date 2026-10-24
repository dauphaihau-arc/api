import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { PaymentGateway } from '~/integrations/payment/app/ports/payment-gateway';
import type {
  ProviderBalanceTransaction,
} from '~/integrations/payment/app/ports/payment-gateway';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { MikroOrmJournalEntryRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmProviderFeeRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-provider-fee.repository';
import { RecordProviderFeeUseCase } from '~/domains/finance/app/use-cases/record-provider-fee/record-provider-fee.use-case';
import {
  RecordProviderFeeJob,
  STRIPE_WEBHOOK_ACTOR,
} from '~/domains/finance/jobs/record-provider-fee.job';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

type AccountTotalRow = {
  kind: string;
  total_minor: number;
};

type FeeRow = {
  provider: string;
  provider_reference: string;
  amount_minor: number;
  currency: string;
  recorded_at: Date;
  journal_entry_id: string;
};

type JournalEntryRow = {
  money_event_key: string;
  money_event_kind: string;
  shop_id: string | null;
  currency: string;
};

/**
 * The Provider Fee seam: real PostgreSQL, real repositories, real use case. A
 * fee is a platform expense, so these tests assert the ledger posting and — as
 * importantly — that no shop's Seller Payable moves.
 */
describe('Provider fees (integration)', () => {
  let testDb: TestDatabaseContext;
  let orm: MikroORM;

  const auditLogService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;

  beforeAll(async () => {
    testDb = await createTestDatabase('finance_provider_fees');
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
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  function buildUseCase(): RecordProviderFeeUseCase {
    const entityManager: EntityManager = orm.em.fork();

    return new RecordProviderFeeUseCase(
      entityManager,
      new MikroOrmJournalEntryRepository(entityManager),
      new MikroOrmProviderFeeRepository(entityManager),
      auditLogService,
      { now: () => new Date('2026-10-23T10:00:00.000Z') },
    );
  }

  async function accountTotals(): Promise<Map<string, number>> {
    const rows = await orm.em.execute<AccountTotalRow[]>(
      `select la."kind" as "kind",
              coalesce(sum(p."amount_minor"), 0)::int as "total_minor"
       from "ledger_accounts" la
       left join "postings" p on p."ledger_account_id" = la."id"
       group by la."kind"`,
    );

    return new Map(rows.map((row) => [row.kind, Number(row.total_minor)]));
  }

  async function readFees(): Promise<FeeRow[]> {
    return orm.em.execute<FeeRow[]>(
      `select "provider", "provider_reference", "amount_minor", "currency",
              "recorded_at", "journal_entry_id"
       from "provider_fees"
       order by "recorded_at", "provider_reference"`,
    );
  }

  async function readFeeEntries(): Promise<JournalEntryRow[]> {
    return orm.em.execute<JournalEntryRow[]>(
      `select "money_event_key", "money_event_kind", "shop_id", "currency"
       from "journal_entries"
       order by "money_event_key"`,
    );
  }

  it('expenses a positive fee on Platform Fee without touching Seller Payable', async () => {
    const result = await buildUseCase().execute({
      provider: 'stripe',
      providerReference: 'txn_charge_1',
      currency: 'usd',
      amountMinor: 189,
      occurredAt: new Date('2026-10-23T09:15:00.000Z'),
      actorId: STRIPE_WEBHOOK_ACTOR,
    });

    expect(result.replayed).toBe(false);
    expect(result.fee).toMatchObject({
      provider: 'stripe',
      providerReference: 'txn_charge_1',
      currency: 'USD',
      amountMinor: 189,
    });

    const totals = await accountTotals();
    expect(totals.get('platform_fee')).toBe(-189);
    expect(totals.get('platform_clearing')).toBe(189);
    expect(totals.get('seller_payable') ?? 0).toBe(0);

    const entries = await readFeeEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      money_event_kind: 'provider.fee',
      shop_id: null,
      currency: 'USD',
    });

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'finance.provider_fee.recorded',
        actor: { actorId: STRIPE_WEBHOOK_ACTOR },
        summary: expect.objectContaining({ source: 'webhook' }),
      }),
    );
  });

  it('records a negative reversal that reduces the Platform Fee expense', async () => {
    await buildUseCase().execute({
      provider: 'stripe',
      providerReference: 'txn_charge_1_reversal',
      currency: 'USD',
      amountMinor: -189,
      occurredAt: new Date('2026-10-23T09:20:00.000Z'),
      actorId: STRIPE_WEBHOOK_ACTOR,
    });

    const totals = await accountTotals();
    expect(totals.get('platform_fee')).toBe(0);
    expect(totals.get('platform_clearing')).toBe(0);
    expect(totals.get('seller_payable') ?? 0).toBe(0);
  });

  it('writes nothing when the same provider charge is recorded again', async () => {
    const before = await readFees();

    const result = await buildUseCase().execute({
      provider: 'stripe',
      providerReference: 'txn_charge_1',
      currency: 'USD',
      amountMinor: 189,
      occurredAt: new Date('2026-10-23T09:15:00.000Z'),
      actorId: STRIPE_WEBHOOK_ACTOR,
    });

    expect(result.replayed).toBe(true);
    expect(await readFees()).toEqual(before);
    expect(await readFeeEntries()).toHaveLength(2);
    expect((await accountTotals()).get('platform_fee')).toBe(0);
  });

  it('records the fee a webhook job reads from the provider balance transaction', async () => {
    const balanceTransaction: ProviderBalanceTransaction = {
      id: 'txn_webhook_2',
      amountMinor: 1189,
      feeMinor: 189,
      netMinor: 1000,
      currency: 'USD',
      createdAt: new Date('2026-10-23T11:00:00.000Z'),
    };
    const paymentGateway = {
      retrieveBalanceTransaction: jest.fn().mockResolvedValue(balanceTransaction),
    } as unknown as PaymentGateway;

    const job = new RecordProviderFeeJob(paymentGateway, buildUseCase());
    await job.run({ balanceTransactionId: 'txn_webhook_2' });

    const fee = (await readFees()).find(
      (row) => row.provider_reference === 'txn_webhook_2',
    );
    expect(fee).toMatchObject({
      provider: 'stripe',
      provider_reference: 'txn_webhook_2',
      amount_minor: 189,
      currency: 'USD',
    });

    expect(fee).toBeDefined();
    const feeEntries = (await readFeeEntries()).filter(
      (row) => row.money_event_kind === 'provider.fee',
    );
    expect(feeEntries).toHaveLength(3);
    expect(feeEntries.every((row) => row.shop_id === null)).toBe(true);

    const totals = await accountTotals();
    expect(totals.get('platform_fee')).toBe(-189);
    expect(totals.get('seller_payable') ?? 0).toBe(0);
  });

  it('keeps a job replay idempotent per provider reference', async () => {
    const balanceTransaction: ProviderBalanceTransaction = {
      id: 'txn_webhook_2',
      amountMinor: 1189,
      feeMinor: 189,
      netMinor: 1000,
      currency: 'USD',
      createdAt: new Date('2026-10-23T11:00:00.000Z'),
    };
    const paymentGateway = {
      retrieveBalanceTransaction: jest.fn().mockResolvedValue(balanceTransaction),
    } as unknown as PaymentGateway;

    await new RecordProviderFeeJob(paymentGateway, buildUseCase()).run({
      balanceTransactionId: 'txn_webhook_2',
    });

    expect(
      (await readFees()).filter((row) => row.provider_reference === 'txn_webhook_2'),
    ).toHaveLength(1);
    expect((await accountTotals()).get('platform_fee')).toBe(-189);
  });
});
