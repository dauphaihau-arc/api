import { ResolveLegacyPathUseCase } from './resolve-legacy-path.use-case';
import type { CategoryRepository } from '../../ports/category.repository';
import type { CategoryResolution } from '../../category.types';

describe('ResolveLegacyPathUseCase', () => {
  const resolution: CategoryResolution = {
    category: { id: '34', slug: 'ceramic-mugs', name: 'Mugs' },
    ancestry: [{ id: '34', slug: 'ceramic-mugs', name: 'Mugs' }],
  };

  function buildRepository() {
    return {
      resolveLegacyPath: jest.fn(),
    } as unknown as jest.Mocked<CategoryRepository>;
  }

  it('resolves an owned legacy path to its current category', async () => {
    const repository = buildRepository();
    repository.resolveLegacyPath.mockResolvedValue(resolution);
    const useCase = new ResolveLegacyPathUseCase(repository);

    const result = await useCase.execute('/c/home/mugs');

    expect(result.isOk).toBe(true);

    if (!result.isOk) {
      throw new Error('expected a resolved legacy path');
    }

    expect(result.value).toEqual(resolution);
    expect(repository.resolveLegacyPath).toHaveBeenCalledWith('/c/home/mugs');
  });

  it('treats a missing path as not found without querying the repository', async () => {
    const repository = buildRepository();
    const useCase = new ResolveLegacyPathUseCase(repository);

    const missing = await useCase.execute(undefined);

    expect(missing.isOk).toBe(false);
    expect(repository.resolveLegacyPath).not.toHaveBeenCalled();
  });

  it('maps a malformed or unowned path to not found', async () => {
    const repository = buildRepository();
    repository.resolveLegacyPath.mockResolvedValue(null);
    const useCase = new ResolveLegacyPathUseCase(repository);

    const unowned = await useCase.execute('/c/home/unknown');
    const malformed = await useCase.execute('/c/home/');

    expect(unowned.isOk).toBe(false);
    expect(malformed.isOk).toBe(false);
  });
});
