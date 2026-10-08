import { randomBytes } from 'node:crypto';

const PUBLIC_ID_BYTES = 6;

/**
 * Prefixes for entity public ids. The prefix encodes the entity type so ids
 * are self-describing and can be validated/routed without a database lookup.
 * Extend this union when a new table joins the external contract.
 */
export type PublicIdPrefix =
  | 'shop'
  | 'prod'
  | 'ord'
  | 'shp'
  | 'cnv'
  | 'exp'
  | 'imp'
  | 'prm';

export function createPublicId(prefix: PublicIdPrefix): string {
  return `${prefix}_${randomBytes(PUBLIC_ID_BYTES).toString('hex')}`;
}

/**
 * Opaque id for storage objects. Storage keys are not part of the entity
 * public-id contract, so they stay unprefixed.
 */
export function createStorageId(): string {
  return randomBytes(PUBLIC_ID_BYTES).toString('hex');
}
