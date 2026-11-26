import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import { CatalogShipToInvalidError } from '../errors/product-app.error';
import { CatalogShipToResolver } from './catalog-ship-to.resolver';

describe('CatalogShipToResolver', () => {
  const findActiveCountry = jest.fn();
  const resolver = new CatalogShipToResolver({
    findActiveCountry,
  } as unknown as LocationReferenceRepository);

  beforeEach(() => {
    findActiveCountry.mockReset();
    findActiveCountry.mockImplementation(async (code: string) =>
      code === 'US' || code === 'VN'
        ? {
          code,
          name: code,
          postalCodeRequired: false,
          hasAdministrativeAreas: false,
        }
        : null);
  });

  it('passes an absent value through without a lookup', async () => {
    await expect(resolver.resolve(undefined)).resolves.toBeUndefined();
    await expect(resolver.resolve('   ')).resolves.toBeUndefined();
    expect(findActiveCountry).not.toHaveBeenCalled();
  });

  it('accepts `all` without a lookup', async () => {
    await expect(resolver.resolve('all')).resolves.toBe('all');
    await expect(resolver.resolve('ALL')).resolves.toBe('all');
    expect(findActiveCountry).not.toHaveBeenCalled();
  });

  it('normalizes an active country code', async () => {
    await expect(resolver.resolve('us')).resolves.toBe('US');
    expect(findActiveCountry).toHaveBeenCalledWith('US');
  });

  it('rejects an unknown or inactive country', async () => {
    await expect(resolver.resolve('zz')).rejects.toBeInstanceOf(
      CatalogShipToInvalidError,
    );
  });

  it('rejects a malformed country code before the lookup', async () => {
    await expect(resolver.resolve('USA')).rejects.toBeInstanceOf(
      CatalogShipToInvalidError,
    );
    expect(findActiveCountry).not.toHaveBeenCalled();
  });
});
