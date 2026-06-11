import { APIGatewayProxyEvent } from 'aws-lambda';
import { generateUploadUrl } from '../generate-upload-url';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn().mockResolvedValue({
    url: 'https://pending-bucket.s3.amazonaws.com',
    fields: {
      key: 'uploads/pending/image-id/original.webp',
      'Content-Type': 'image/webp',
      policy: 'policy',
      'x-amz-signature': 'signature',
    },
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'image-id'),
}));

const { createPresignedPost } = jest.requireMock('@aws-sdk/s3-presigned-post');

const createEvent = (
  body: unknown,
  groups: unknown = 'Admin',
): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  requestContext: {
    authorizer: {
      claims: {
        'cognito:groups': groups,
      },
    },
  },
} as unknown as APIGatewayProxyEvent);

describe('generateUploadUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PENDING_IMAGE_BUCKET = 'pending-bucket';
    process.env.IMAGE_DOMAIN = 'images.test.cravnest.in';
    process.env.ADMIN_GROUP_NAME = 'Admin';
  });

  it('returns a presigned POST and final WebP URL for admin image uploads', async () => {
    const response = await generateUploadUrl(createEvent({ contentType: 'image/webp' }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      url: 'https://pending-bucket.s3.amazonaws.com',
      imageId: 'image-id',
      pendingKey: 'uploads/pending/image-id/original.webp',
      imageUrl: 'https://images.test.cravnest.in/items/image-id/image.webp',
      maxUploadBytes: 2097152,
    });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      Bucket: 'pending-bucket',
      Key: 'uploads/pending/image-id/original.webp',
      Conditions: [
        ['content-length-range', 1, 2097152],
        { 'Content-Type': 'image/webp' },
      ],
      Fields: {
        'Content-Type': 'image/webp',
      },
      Expires: 300,
    }));
  });

  it('rejects callers outside the Admin group', async () => {
    const response = await generateUploadUrl(createEvent({ contentType: 'image/png' }, 'KitchenOps'));

    expect(response.statusCode).toBe(403);
    expect(createPresignedPost).not.toHaveBeenCalled();
  });

  it('rejects unsupported content types', async () => {
    const response = await generateUploadUrl(createEvent({ contentType: 'image/svg+xml' }));

    expect(response.statusCode).toBe(400);
    expect(createPresignedPost).not.toHaveBeenCalled();
  });
});
