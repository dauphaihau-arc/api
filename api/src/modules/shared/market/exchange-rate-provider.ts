export interface ExchangeRateProviderQuote {
  source: string;
  baseCurrency: string;
  rates: Record<string, string>;
  asOf: Date;
}

export interface ExchangeRateProvider {
  getLatestRates(input: {
    currencies: string[];
  }): Promise<ExchangeRateProviderQuote>;
}

export const EXCHANGE_RATE_PROVIDER = Symbol('EXCHANGE_RATE_PROVIDER');
