import { ManualBankPayoutGateway } from './manual-bank-payout.gateway';

const PAYOUT_ID = 'payout_01HSTUB';

function transferInput(payoutPublicId = PAYOUT_ID) {
  return {
    payoutPublicId,
    provider: 'manual_bank',
    amountMinor: 12_500,
    currency: 'USD',
    destination: {
      type: 'bank_account',
      holderName: 'Ada Seller',
      bankName: 'Stub Bank',
      country: 'US',
      last4: '4242',
      reference: 'acct_stub_reference',
    },
  };
}

async function failureOf(gateway: ManualBankPayoutGateway): Promise<string> {
  try {
    await gateway.send(transferInput());
  }
  catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected the stub gateway to fail');
}

describe('ManualBankPayoutGateway', () => {
  it('succeeds by default and references the Payout public id', async () => {
    await expect(
      new ManualBankPayoutGateway({}).send(transferInput()),
    ).resolves.toEqual({ reference: PAYOUT_ID });
  });

  it('fails the first of N attempts for one Payout, then succeeds', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
    });

    await expect(gateway.send(transferInput())).rejects.toThrow();
    await expect(gateway.send(transferInput())).resolves.toEqual({
      reference: PAYOUT_ID,
    });
  });

  it('counts separately per Payout public id', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
    });

    await expect(gateway.send(transferInput('payout_a'))).rejects.toThrow();
    await expect(gateway.send(transferInput('payout_a'))).resolves.toEqual({
      reference: 'payout_a',
    });
    // A different Payout has its own budget, so its first call still fails.
    await expect(gateway.send(transferInput('payout_b'))).rejects.toThrow();
  });

  it('fails all four bounded attempts when N is 4', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '4',
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(gateway.send(transferInput())).rejects.toThrow();
    }

    // A fifth call is past the configured failures and still succeeds; the
    // bound is the adapter's, the attempt limit stays the domain's.
    await expect(gateway.send(transferInput())).resolves.toEqual({
      reference: PAYOUT_ID,
    });
  });

  it('defaults the failure reason to stub_provider_decline', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
    });

    await expect(failureOf(gateway)).resolves.toContain('stub_provider_decline');
  });

  it('uses the configured reason in an error-mode message', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
      PAYOUT_STUB_FAIL_REASON: 'bank_timeout',
    });
    const message = await failureOf(gateway);

    expect(message).toContain('bank_timeout');
    expect(message).toContain('Stub payout provider error');
  });

  it('uses the reason alone in a declined-mode message', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
      PAYOUT_STUB_FAIL_REASON: 'insufficient_funds',
      PAYOUT_STUB_FAIL_MODE: 'declined',
    });

    await expect(failureOf(gateway)).resolves.toBe('insufficient_funds');
  });

  it('defaults the mode to a provider error', async () => {
    const gateway = new ManualBankPayoutGateway({
      PAYOUT_STUB_FAIL_ATTEMPTS: '1',
    });

    await expect(failureOf(gateway)).resolves.not.toBe(
      'stub_provider_decline',
    );
  });

  it('treats an unset or zero attempt budget as never failing', async () => {
    await expect(
      new ManualBankPayoutGateway({ PAYOUT_STUB_FAIL_ATTEMPTS: '0' })
        .send(transferInput()),
    ).resolves.toEqual({ reference: PAYOUT_ID });
  });

  it.each(['abc', '-1', '1.5'])(
    'rejects the invalid attempt budget %p',
    (value) => {
      expect(() =>
        new ManualBankPayoutGateway({ PAYOUT_STUB_FAIL_ATTEMPTS: value }),
      ).toThrow(/PAYOUT_STUB_FAIL_ATTEMPTS/);
    },
  );

  it('treats an empty attempt budget as unset', async () => {
    await expect(
      new ManualBankPayoutGateway({ PAYOUT_STUB_FAIL_ATTEMPTS: '' })
        .send(transferInput()),
    ).resolves.toEqual({ reference: PAYOUT_ID });
  });

  it('rejects an unknown fail mode', () => {
    expect(() =>
      new ManualBankPayoutGateway({ PAYOUT_STUB_FAIL_MODE: 'explode' }),
    ).toThrow(/PAYOUT_STUB_FAIL_MODE/);
  });

  it.each([
    ['PAYOUT_STUB_FAIL_ATTEMPTS', '1'],
    ['PAYOUT_STUB_FAIL_REASON', 'stub_provider_decline'],
    ['PAYOUT_STUB_FAIL_MODE', 'declined'],
  ])('refuses %s in production', (key, value) => {
    expect(() =>
      new ManualBankPayoutGateway({
        NODE_ENV: 'production',
        [key]: value,
      }),
    ).toThrow(/local\/test-only/);
  });

  it('stays inert in production when no stub switch is set', async () => {
    await expect(
      new ManualBankPayoutGateway({ NODE_ENV: 'production' }).send(transferInput()),
    ).resolves.toEqual({ reference: PAYOUT_ID });
  });
});
