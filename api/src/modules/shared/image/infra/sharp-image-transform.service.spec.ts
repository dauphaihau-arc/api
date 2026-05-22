import sharp from 'sharp';
import { SharpImageTransformService } from './sharp-image-transform.service';

describe('SharpImageTransformService', () => {
  const service = new SharpImageTransformService();

  async function createSourceImage(): Promise<Buffer> {
    return sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: {
          r: 200,
          g: 120,
          b: 40,
        },
      },
    })
      .png()
      .toBuffer();
  }

  it('reads image metadata', async () => {
    const source = await createSourceImage();

    const metadata = await service.getMetadata(source);

    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(800);
    expect(metadata.format).toBe('png');
  });

  it('resizes and converts an image to webp', async () => {
    const source = await createSourceImage();

    const output = await service.transform(source, {
      width: 600,
      height: 600,
      fit: 'cover',
      format: 'webp',
      quality: 82,
    });

    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(600);
    expect(metadata.height).toBe(600);
    expect(metadata.format).toBe('webp');
  });
});
