import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse } from './utils';

const s3Client = new S3Client({});
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const UPLOAD_EXPIRY_SECONDS = 300;
const ADMIN_GROUP_NAME = process.env.ADMIN_GROUP_NAME || 'Admin';

const contentTypeToExtension: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const parseGroups = (groupsClaim: unknown): string[] => {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.filter((group): group is string => typeof group === 'string');
  }
  if (typeof groupsClaim === 'string') {
    return groupsClaim.split(',').map((group) => group.trim()).filter(Boolean);
  }
  return [];
};

const isAdminRequest = (event: APIGatewayProxyEvent): boolean => {
  const claims = event.requestContext.authorizer?.claims || {};
  return parseGroups(claims['cognito:groups']).includes(ADMIN_GROUP_NAME);
};

export const generateUploadUrl = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdminRequest(event)) {
      return createErrorResponse(403, 'Admin access is required to upload item images');
    }

    const body = JSON.parse(event.body || '{}');
    const { contentType } = body;
    
    if (!contentType || typeof contentType !== 'string') {
      return createErrorResponse(400, 'contentType is required');
    }

    const extension = contentTypeToExtension[contentType];
    if (!extension) {
      return createErrorResponse(400, 'Unsupported image type. Allowed types: image/jpeg, image/png, image/webp, image/avif');
    }

    const imageId = uuidv4();
    const pendingKey = `uploads/pending/${imageId}/original.${extension}`;
    const finalKey = `items/${imageId}/image.webp`;
    const pendingBucket = getRequiredEnv('PENDING_IMAGE_BUCKET');
    const imageDomain = getRequiredEnv('IMAGE_DOMAIN');

    const presignedPost = await createPresignedPost(s3Client, {
      Bucket: pendingBucket,
      Key: pendingKey,
      Conditions: [
        ['content-length-range', 1, MAX_UPLOAD_BYTES],
        { 'Content-Type': contentType },
      ],
      Fields: {
        'Content-Type': contentType,
      },
      Expires: UPLOAD_EXPIRY_SECONDS,
    });

    const imageUrl = `https://${imageDomain}/${finalKey}`;

    return createSuccessResponse(200, {
      url: presignedPost.url,
      fields: presignedPost.fields,
      imageId,
      pendingKey,
      imageUrl,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      allowedContentTypes: Object.keys(contentTypeToExtension),
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return createErrorResponse(500, 'Failed to generate upload URL');
  }
};
