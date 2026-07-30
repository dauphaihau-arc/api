import sharp from 'sharp';
import type { ImageMetadata, ImageTransformSpec } from '../app/image-transform.types';
import type { ImageTransformService } from '../app/ports/image-transform.service';

export class SharpImageTransformService implements ImageTransformService {
  async getMetadata(input: Buffer): Promise<ImageMetadata> {
    const metadata = await sharp(input).metadata();

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  }

  async transform(input: Buffer, spec: ImageTransformSpec): Promise<Buffer> {
    let pipeline = sharp(
      spec.removeBackground
        ? await this.removeBackground(input)
        : input,
    ).resize({
      width: spec.width,
      height: spec.height,
      fit: spec.fit,
      background: spec.background,
    });

    switch (spec.format) {
      case 'webp':
        pipeline = pipeline.webp({
          quality: spec.quality,
        });
        break;
      case 'jpg':
        pipeline = pipeline.jpeg({
          quality: spec.quality,
        });
        break;
      case 'png':
        pipeline = pipeline.png({
          quality: spec.quality,
        });
        break;
      case 'avif':
        pipeline = pipeline.avif({
          quality: spec.quality,
        });
        break;
    }

    return pipeline.toBuffer();
  }

  private async removeBackground(input: Buffer): Promise<Buffer> {
    const source = sharp(input).ensureAlpha();
    const metadata = await source.metadata();

    if (!metadata.width || !metadata.height) {
      return input;
    }

    const { data: pixelBuffer, info } = await source
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels < 4) {
      return input;
    }

    const backgroundColor = resolveBackgroundColor(
      pixelBuffer,
      info.width,
      info.height,
      info.channels,
    );

    if (!backgroundColor) {
      return input;
    }

    const next = Buffer.from(pixelBuffer);
    const queue: number[] = [];
    const visited = new Uint8Array(info.width * info.height);

    const enqueueIfBackground = (x: number, y: number): void => {
      if (x < 0 || x >= info.width || y < 0 || y >= info.height) {
        return;
      }

      const pixelIndex = (y * info.width) + x;

      if (visited[pixelIndex]) {
        return;
      }

      visited[pixelIndex] = 1;

      if (!isBackgroundPixel(next, pixelIndex * info.channels, info.channels, backgroundColor)) {
        return;
      }

      queue.push(pixelIndex);
    };

    for (let x = 0; x < info.width; x += 1) {
      enqueueIfBackground(x, 0);
      enqueueIfBackground(x, info.height - 1);
    }

    for (let y = 0; y < info.height; y += 1) {
      enqueueIfBackground(0, y);
      enqueueIfBackground(info.width - 1, y);
    }

    while (queue.length > 0) {
      const pixelIndex = queue.shift();

      if (pixelIndex === undefined) {
        continue;
      }

      const offset = pixelIndex * info.channels;
      next[offset + 3] = 0;

      const x = pixelIndex % info.width;
      const y = Math.floor(pixelIndex / info.width);

      enqueueIfBackground(x + 1, y);
      enqueueIfBackground(x - 1, y);
      enqueueIfBackground(x, y + 1);
      enqueueIfBackground(x, y - 1);
    }

    return sharp(next, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    }).png().toBuffer();
  }
}

type RgbaColor = {
  red: number;
  green: number;
  blue: number;
};

const CORNER_VARIANCE_THRESHOLD = 35;
const BACKGROUND_DISTANCE_THRESHOLD = 45;
const MIN_BACKGROUND_ALPHA = 245;

function resolveBackgroundColor(
  pixelBuffer: Buffer,
  width: number,
  height: number,
  channels: number,
): RgbaColor | null {
  const corners = [
    readPixel(pixelBuffer, 0, channels),
    readPixel(pixelBuffer, (width - 1) * channels, channels),
    readPixel(pixelBuffer, (height - 1) * width * channels, channels),
    readPixel(pixelBuffer, ((height * width) - 1) * channels, channels),
  ];

  if (corners.some((corner) => corner.alpha < MIN_BACKGROUND_ALPHA)) {
    return null;
  }

  const reference = corners[0];
  const isUniform = corners.every((corner) =>
    colorDistance(reference, corner) <= CORNER_VARIANCE_THRESHOLD,
  );

  if (!isUniform) {
    return null;
  }

  const total = corners.reduce(
    (accumulator, corner) => ({
      red: accumulator.red + corner.red,
      green: accumulator.green + corner.green,
      blue: accumulator.blue + corner.blue,
    }),
    { red: 0, green: 0, blue: 0 },
  );

  return {
    red: Math.round(total.red / corners.length),
    green: Math.round(total.green / corners.length),
    blue: Math.round(total.blue / corners.length),
  };
}

function isBackgroundPixel(
  pixelBuffer: Buffer,
  offset: number,
  channels: number,
  background: RgbaColor,
): boolean {
  const pixel = readPixel(pixelBuffer, offset, channels);

  return pixel.alpha >= MIN_BACKGROUND_ALPHA
    && colorDistance(pixel, background) <= BACKGROUND_DISTANCE_THRESHOLD;
}

function readPixel(pixelBuffer: Buffer, offset: number, channels: number): {
  red: number;
  green: number;
  blue: number;
  alpha: number;
} {
  return {
    red: pixelBuffer[offset] ?? 0,
    green: pixelBuffer[offset + 1] ?? 0,
    blue: pixelBuffer[offset + 2] ?? 0,
    alpha: channels > 3 ? (pixelBuffer[offset + 3] ?? 255) : 255,
  };
}

function colorDistance(
  left: RgbaColor,
  right: RgbaColor,
): number {
  return Math.sqrt(
    ((left.red - right.red) ** 2) +
      ((left.green - right.green) ** 2) +
      ((left.blue - right.blue) ** 2),
  );
}
