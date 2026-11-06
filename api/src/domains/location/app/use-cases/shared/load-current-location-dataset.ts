import { err, ok, type Result } from '~/platform/application/result';
import { LocationDatasetUnavailableError } from '../../errors/location-app.error';
import type { LocationDatasetVersion } from '../../location.types';
import type { LocationReferenceRepository } from '../../ports/location-reference.repository';

/**
 * Both public reads require an activated dataset. A missing current version is
 * an operational state, not an empty result.
 */
export async function loadCurrentLocationDataset(
  repository: LocationReferenceRepository,
): Promise<Result<LocationDatasetVersion, LocationDatasetUnavailableError>> {
  const dataset = await repository.findCurrentDatasetVersion();

  return dataset
    ? ok(dataset)
    : err(new LocationDatasetUnavailableError());
}
