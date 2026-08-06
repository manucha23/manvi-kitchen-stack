import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class S3StorageService {
  private s3Client: S3Client;

  constructor(s3Client?: S3Client) {
    this.s3Client = s3Client || new S3Client({});
  }

  public async uploadInvoicePdf(bucketName: string, key: string, pdfBuffer: Buffer): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    );
  }
}
