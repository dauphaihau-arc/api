import type { ImageMetadata, ImageTransformSpec } from '../image.types';

export abstract class ImageTransformService {
  abstract getMetadata(input: Buffer): Promise<ImageMetadata>;
  abstract transform(input: Buffer, spec: ImageTransformSpec): Promise<Buffer>;
}
