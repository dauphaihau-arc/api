import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function slugifySeedValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getProductAssetDirectory(rootDir: string, shopSlug: string, productTitle: string): string {
  return path.join(
    rootDir,
    shopSlug,
    slugifySeedValue(productTitle)
  );
}

function normalizeRootDirs(rootDirOrDirs: string | string[]): string[] {
  return Array.isArray(rootDirOrDirs) ? rootDirOrDirs : [rootDirOrDirs];
}

function isSupportedImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function getImageRank(filename: string): [number, string] {
  const normalized = filename.toLowerCase();

  if (normalized.startsWith('hero.')) {
    return [0, normalized];
  }

  if (normalized.startsWith('main.')) {
    return [0, normalized];
  }

  if (normalized.startsWith('detail-')) {
    return [1, normalized];
  }

  if (normalized.startsWith('with-model.')) {
    return [1, normalized];
  }

  return [2, normalized];
}

export function resolveSeedProductAssetDirectory(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string
): string {
  const candidateDirs = normalizeRootDirs(rootDirOrDirs).map((rootDir) =>
    getProductAssetDirectory(rootDir, shopSlug, productTitle)
  );
  const existingDir = candidateDirs.find((candidateDir) => existsSync(candidateDir));

  if (!existingDir) {
    throw new Error(`Missing product asset directory. Tried: ${candidateDirs.join(', ')}`);
  }

  return existingDir;
}

export function resolveOptionalSeedProductAssetDirectory(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string
): string | undefined {
  const candidateDirs = normalizeRootDirs(rootDirOrDirs).map((rootDir) =>
    getProductAssetDirectory(rootDir, shopSlug, productTitle)
  );

  return candidateDirs.find((candidateDir) => existsSync(candidateDir));
}

export function resolveSeedProductImagePaths(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string
): string[] {
  const productAssetDir = resolveSeedProductAssetDirectory(rootDirOrDirs, shopSlug, productTitle);

  const imageFilenames = readdirSync(productAssetDir)
    .filter((filename) => !filename.startsWith('.'))
    .filter(isSupportedImageFile)
    .sort((left, right) => {
      const [leftRank, leftName] = getImageRank(left);
      const [rightRank, rightName] = getImageRank(right);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return leftName.localeCompare(rightName);
    });

  if (imageFilenames.length === 0) {
    throw new Error(`No product images found in: ${productAssetDir}`);
  }

  if (
    !imageFilenames.some((filename) => {
      const normalized = filename.toLowerCase();
      return normalized.startsWith('hero.') || normalized.startsWith('main.');
    })
  ) {
    throw new Error(`Missing hero/main image in: ${productAssetDir}`);
  }

  return imageFilenames.map((filename) =>
    path.posix.join(
      shopSlug,
      slugifySeedValue(productTitle),
      filename
    )
  );
}

export function resolveOptionalSeedProductImagePaths(
  rootDirOrDirs: string | string[],
  shopSlug: string,
  productTitle: string
): string[] {
  const productAssetDir = resolveOptionalSeedProductAssetDirectory(
    rootDirOrDirs,
    shopSlug,
    productTitle
  );

  if (!productAssetDir) {
    return [];
  }

  return resolveSeedProductImagePaths(rootDirOrDirs, shopSlug, productTitle);
}
