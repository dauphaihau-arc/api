import sharp from 'sharp';
import type { ImageMetadata, ImageTransformSpec } from '../app/image.types';
import { ImageTransformService } from '../app/ports/image-transform.service';

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
    let pipeline = sharp(input).resize({
      width: spec.width,
      height: spec.height,
      fit: spec.fit,
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
}
