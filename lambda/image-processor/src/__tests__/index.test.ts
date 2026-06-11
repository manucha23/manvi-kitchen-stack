import sharp from 'sharp';
import { extractPendingImageObject, processImageBuffer } from '../index';

describe('image processor', () => {
  it('extracts pending image IDs from supported upload keys', () => {
    expect(extractPendingImageObject('uploads/pending/abc-123/original.webp')).toEqual({
      imageId: 'abc-123',
      extension: 'webp',
    });
    expect(extractPendingImageObject('items/abc-123/image.webp')).toBeUndefined();
  });

  it('converts a valid WebP source into WebP, AVIF, and JPEG outputs', async () => {
    const source = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#e84d3c',
      },
    }).webp().toBuffer();

    const outputs = await processImageBuffer({ imageId: 'image-id', extension: 'webp' }, source);

    expect(outputs.map((output) => output.key)).toEqual([
      'items/image-id/image.webp',
      'items/image-id/image.avif',
      'items/image-id/image.jpg',
    ]);
    expect(outputs.map((output) => output.contentType)).toEqual([
      'image/webp',
      'image/avif',
      'image/jpeg',
    ]);
    expect(outputs.every((output) => output.body.length > 0)).toBe(true);
  });

  it('accepts AVIF sources reported by sharp as HEIF with AV1 compression', async () => {
    const source = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#e84d3c',
      },
    }).avif().toBuffer();

    const outputs = await processImageBuffer({ imageId: 'image-id', extension: 'avif' }, source);

    expect(outputs).toHaveLength(3);
    expect(outputs[0].key).toBe('items/image-id/image.webp');
  });

  it('rejects content whose actual format does not match the upload extension', async () => {
    const source = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#e84d3c',
      },
    }).png().toBuffer();

    await expect(processImageBuffer({ imageId: 'image-id', extension: 'webp' }, source))
      .rejects
      .toThrow('Uploaded image format does not match extension');
  });

  it('rejects images above the maximum dimensions', async () => {
    const source = await sharp({
      create: {
        width: 2049,
        height: 10,
        channels: 3,
        background: '#e84d3c',
      },
    }).webp().toBuffer();

    await expect(processImageBuffer({ imageId: 'image-id', extension: 'webp' }, source))
      .rejects
      .toThrow('Uploaded image exceeds 2048px maximum dimension');
  });
});
