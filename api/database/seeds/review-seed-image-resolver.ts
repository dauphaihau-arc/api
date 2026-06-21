import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import {
  buildStorageObjectKey,
  resolveStorageEnvironmentSegment,
} from '~/modules/shared/storage/app/storage-key-builder';
import { slugifySeedValue } from './product-seed-image-resolver';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function isSupportedImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function normalizeRootDirs(rootDirOrDirs: string | string[]): string[] {
  return Array.isArray(rootDirOrDirs) ? rootDirOrDirs : [rootDirOrDirs];
}

function buildReviewAssetDirectory(rootDir: string, shopSlug: string, productTitle: string, userEmail: string): string {
  return path.join(
    rootDir,
    shopSlug,
    slugifySeedValue(productTitle),
    slugifySeedValue(userEmail),
  );
}

export function resolveOptionalSeedReviewAssetDirectory(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string,
  userEmail: string,
): string | undefined {
  const candidateDirs = normalizeRootDirs(rootDirOrDirs).map((rootDir) =>
    buildReviewAssetDirectory(rootDir, shopSlug, productTitle, userEmail),
  );

  return candidateDirs.find((candidateDir) => existsSync(candidateDir));
}

export function resolveOptionalSeedReviewImagePaths(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string,
  userEmail: string,
): string[] {
  const candidateDirs = normalizeRootDirs(rootDirOrDirs).map((rootDir) =>
    buildReviewAssetDirectory(rootDir, shopSlug, productTitle, userEmail),
  );
  const mergedImagePaths: string[] = [];
  const seenFilenames = new Set<string>();

  for (const assetDirectory of candidateDirs) {
    if (!existsSync(assetDirectory)) {
      continue;
    }

    const imageFilenames = readdirSync(assetDirectory)
      .filter((filename) => !filename.startsWith('.'))
      .filter(isSupportedImageFile)
      .sort((left, right) => left.localeCompare(right));

    if (imageFilenames.length === 0) {
      continue;
    }

    imageFilenames.forEach((filename) => {
      if (seenFilenames.has(filename)) {
        return;
      }

      seenFilenames.add(filename);
      mergedImagePaths.push(path.posix.join(
        shopSlug,
        slugifySeedValue(productTitle),
        slugifySeedValue(userEmail),
        filename,
      ));
    });
  }

  return mergedImagePaths;
}

export function buildSeedReviewImageStorageKey(
  shopSlug: string,
  productTitle: string,
  userEmail: string,
  imageFilename: string,
): string {
  const normalizedFilename = path.basename(imageFilename.trim());
  const extension = path.extname(normalizedFilename).replace(/^\./, '').toLowerCase();
  const filenameWithoutExtension = normalizedFilename.slice(
    0,
    normalizedFilename.length - extension.length - 1,
  );

  if (!extension || !filenameWithoutExtension) {
    throw new Error(`Invalid review image filename "${imageFilename}".`);
  }

  return buildStorageObjectKey({
    env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
    visibility: 'public',
    path: [
      { domain: 'shops', id: shopSlug },
      { domain: 'products', id: slugifySeedValue(productTitle) },
    ],
    collection: 'images',
    assetPath: ['reviews', slugifySeedValue(userEmail), filenameWithoutExtension],
    extension,
    filename: 'original',
  });
}
