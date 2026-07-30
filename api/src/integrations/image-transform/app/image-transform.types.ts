export type ImageOutputFormat = 'webp' | 'jpg' | 'png' | 'avif';

export type ImageResizeFit = 'cover' | 'contain';

export interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
}

export interface ImageTransformSpec {
  width: number;
  height: number;
  fit: ImageResizeFit;
  format: ImageOutputFormat;
  quality?: number;
  background?: string;
  removeBackground?: boolean;
}
