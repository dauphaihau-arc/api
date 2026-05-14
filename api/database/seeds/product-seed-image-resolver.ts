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

function getProductAssetDirectory(rootDir: string, shopName: string, productTitle: string): string {
  return path.join(
    rootDir,
    slugifySeedValue(shopName),
    slugifySeedValue(productTitle)
  );
}

function isSupportedImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function getImageRank(filename: string): [number, string] {
  const normalized = filename.toLowerCase();

  if (normalized.startsWith('hero.')) {
    return [0, normalized];
  }

  if (normalized.startsWith('detail-')) {
    return [1, normalized];
  }

  return [2, normalized];
}

export function resolveSeedProductImagePaths(
  rootDir: string,
  shopName: string,
  productTitle: string
): string[] {
  const productAssetDir = getProductAssetDirectory(rootDir, shopName, productTitle);

  if (!existsSync(productAssetDir)) {
    throw new Error(`Missing product asset directory: ${productAssetDir}`);
  }

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

  if (!imageFilenames.some((filename) => filename.toLowerCase().startsWith('hero.'))) {
    throw new Error(`Missing hero image in: ${productAssetDir}`);
  }

  return imageFilenames.map((filename) =>
    path.posix.join(
      slugifySeedValue(shopName),
      slugifySeedValue(productTitle),
      filename
    )
  );
}
