import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3Event } from 'aws-lambda';
import sharp, { Sharp } from 'sharp';

const s3Client = new S3Client({});

const MAX_DIMENSION_PX = Number(process.env.MAX_DIMENSION_PX || 2048);

type SupportedExtension = 'jpg' | 'png' | 'webp' | 'avif';

export interface PendingImageObject {
  imageId: string;
  extension: SupportedExtension;
}

export interface ProcessedImage {
  key: string;
  contentType: string;
  body: Buffer;
}

export const extractPendingImageObject = (key: string): PendingImageObject | undefined => {
  const match = key.match(/^uploads\/pending\/([^/]+)\/original\.(jpg|png|webp|avif)$/);
  if (!match) {
    return undefined;
  }
  return {
    imageId: match[1],
    extension: match[2] as SupportedExtension,
  };
};

const toBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body || typeof (body as { transformToByteArray?: unknown }).transformToByteArray !== 'function') {
    throw new Error('S3 object body is empty or unreadable');
  }

  const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  return Buffer.from(bytes);
};

const orient = (image: Sharp): Sharp => image.rotate();

export const processImageBuffer = async (
  pendingImage: PendingImageObject,
  input: Buffer,
): Promise<ProcessedImage[]> => {
  const source = sharp(input, { failOn: 'error' });
  const metadata = await source.metadata();

  const validFormat = pendingImage.extension === 'avif'
    ? metadata.format === 'heif' && metadata.compression === 'av1'
    : (
      (pendingImage.extension === 'jpg' && metadata.format === 'jpeg') ||
      metadata.format === pendingImage.extension
    );

  if (!validFormat) {
    throw new Error(`Uploaded image format does not match extension. Got ${metadata.format || 'unknown'}`);
  }

  if (!metadata.width || !metadata.height) {
    throw new Error('Uploaded image dimensions could not be determined');
  }

  if (metadata.width > MAX_DIMENSION_PX || metadata.height > MAX_DIMENSION_PX) {
    throw new Error(`Uploaded image exceeds ${MAX_DIMENSION_PX}px maximum dimension`);
  }

  const baseKey = `items/${pendingImage.imageId}`;
  const baseImage = orient(sharp(input, { failOn: 'error' }));

  const [webp, avif, jpeg] = await Promise.all([
    baseImage.clone().webp({ quality: 82 }).toBuffer(),
    baseImage.clone().avif({ quality: 55 }).toBuffer(),
    baseImage.clone().jpeg({ quality: 85, mozjpeg: true }).toBuffer(),
  ]);

  return [
    { key: `${baseKey}/image.webp`, contentType: 'image/webp', body: webp },
    { key: `${baseKey}/image.avif`, contentType: 'image/avif', body: avif },
    { key: `${baseKey}/image.jpg`, contentType: 'image/jpeg', body: jpeg },
  ];
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const decodeS3Key = (key: string): string => decodeURIComponent(key.replace(/\+/g, ' '));

const processObject = async (bucket: string, key: string): Promise<void> => {
  const pendingImage = extractPendingImageObject(key);
  if (!pendingImage) {
    console.log('Skipping non-pending image object', JSON.stringify({ bucket, key }));
    return;
  }

  const outputBucket = getRequiredEnv('OUTPUT_BUCKET');
  const object = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const input = await toBuffer(object.Body);
  const processedImages = await processImageBuffer(pendingImage, input);

  await Promise.all(processedImages.map((image) => s3Client.send(new PutObjectCommand({
    Bucket: outputBucket,
    Key: image.key,
    Body: image.body,
    ContentType: image.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }))));

  console.log('Image processing completed', JSON.stringify({
    sourceKey: key,
    imageId: pendingImage.imageId,
    outputKeys: processedImages.map((image) => image.key),
  }));
};

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeS3Key(record.s3.object.key);
    try {
      await processObject(bucket, key);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown image processing error';
      console.warn('Image processing failed', JSON.stringify({ key, reason }));
    }
  }
};
