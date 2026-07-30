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
        background: '#c87828',
      },
    })
      .png()
      .toBuffer();
  }

  async function createSubjectOnSolidBackground(): Promise<Buffer> {
    return sharp({
      create: {
        width: 120,
        height: 120,
        channels: 4,
        background: '#ffffffff',
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 60,
              height: 60,
              channels: 4,
              background: '#dc1e1eff',
            },
          }).png().toBuffer(),
          top: 30,
          left: 30,
        },
      ])
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

  it('removes a solid border-connected background to transparency', async () => {
    const source = await createSubjectOnSolidBackground();

    const output = await service.transform(source, {
      width: 120,
      height: 120,
      fit: 'contain',
      format: 'png',
      removeBackground: true,
    });

    const rawImage = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixelBuffer = rawImage['data'];
    const { info } = rawImage;

    const topLeftAlpha = pixelBuffer[3];
    const centerOffset = ((60 * info.width) + 60) * info.channels;
    const centerAlpha = pixelBuffer[centerOffset + 3];

    expect(topLeftAlpha).toBe(0);
    expect(centerAlpha).toBe(255);
  });

  it('applies the configured contain background instead of defaulting to black padding', async () => {
    const source = await createSourceImage();

    const output = await service.transform(source, {
      width: 120,
      height: 150,
      fit: 'contain',
      format: 'png',
      background: '#ffffffff',
    });

    const { data: pixelBuffer } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(Array.from(pixelBuffer.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });
});
