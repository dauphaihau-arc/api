import type { KeyvStoreAdapter, StoredData } from 'keyv';

export class NoopKeyvStore implements KeyvStoreAdapter {
  opts = {};

  get<Value>(_key: string): Promise<StoredData<Value> | undefined> {
    return Promise.resolve(undefined);
  }

  set(_key: string, _value: unknown, _ttl?: number): boolean {
    return true;
  }

  delete(_key: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }

  on(_event: string, _listener: (...arguments_: unknown[]) => void): this {
    return this;
  }
}
