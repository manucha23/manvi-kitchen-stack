# Image Upload Pipeline

Menu item images are uploaded as originals to a private pending bucket, then validated and converted before they are served from the public image CloudFront domain.

## Upload Flow

1. Admin UI calls `POST /items/upload-url` with an allowed content type:

   ```json
   {
     "contentType": "image/webp"
   }
   ```

2. The API returns a presigned S3 POST target and the final processed image URL:

   ```json
   {
     "url": "https://pending-bucket.s3.amazonaws.com",
     "fields": {
       "key": "uploads/pending/<imageId>/original.webp",
       "Content-Type": "image/webp",
       "policy": "...",
       "x-amz-algorithm": "...",
       "x-amz-credential": "...",
       "x-amz-date": "...",
       "x-amz-signature": "..."
     },
     "imageId": "<imageId>",
     "pendingKey": "uploads/pending/<imageId>/original.webp",
     "imageUrl": "https://images.test.cravnest.in/items/<imageId>/image.webp",
     "maxUploadBytes": 2097152,
     "allowedContentTypes": ["image/jpeg", "image/png", "image/webp", "image/avif"]
   }
   ```

3. Admin UI uploads the selected local file to `url` with all returned `fields`.
4. Admin UI may immediately save `imageUrl` on the item.
5. The processor Lambda validates the original and writes `image.webp`, `image.avif`, and `image.jpg` under `items/<imageId>/`.

If validation or conversion fails, no fallback image is written. The final `imageUrl` remains a 404 so the admin sees a broken image and fixes the upload.

## Curl Upload Validation

Use the exact fields returned by `POST /items/upload-url`:

```bash
curl -X POST "$POST_URL" \
  -F "key=$KEY" \
  -F "Content-Type=$CONTENT_TYPE" \
  -F "policy=$POLICY" \
  -F "x-amz-algorithm=$ALGORITHM" \
  -F "x-amz-credential=$CREDENTIAL" \
  -F "x-amz-date=$DATE" \
  -F "x-amz-signature=$SIGNATURE" \
  -F "file=@/path/to/image.webp;type=$CONTENT_TYPE"
```

After upload, the processed URL may take a short time to appear:

```bash
curl -I "$IMAGE_URL"
```

Expected results:

- Valid image under 2 MiB and 2048 px maximum dimension: eventually returns `200`.
- Invalid, spoofed, unsupported, or oversized image: remains `404`; processor emits `ImageProcessingFailures` metric.
