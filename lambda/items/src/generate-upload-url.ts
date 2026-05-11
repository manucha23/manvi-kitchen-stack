import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse } from './utils';

const s3Client = new S3Client({});

export const generateUploadUrl = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, contentType } = body;
    
    if (!fileName || !contentType) {
      return createErrorResponse(400, 'fileName and contentType are required');
    }

    // Generate unique file name
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const key = `items/${uniqueFileName}`;

    // Generate presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: process.env.IMAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

    // Generate domain URL for access
    const imageUrl = `https://${process.env.IMAGE_DOMAIN}/${key}`;

    return createSuccessResponse(200, {
      uploadUrl,
      imageUrl,
      key
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return createErrorResponse(500, 'Failed to generate upload URL');
  }
};