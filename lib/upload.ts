import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (!process.env.STORAGE_ACCESS_KEY || !process.env.STORAGE_SECRET_KEY) {
  throw new Error("STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY environment variables must be set.");
}

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "us-east-1",
  endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET_KEY,
  },
});

const BUCKET = process.env.STORAGE_BUCKET ?? "nepaliestimate-files";

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

export async function getDownloadUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15 min
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export function keyFromUrl(fileUrl: string): string {
  return fileUrl;
}

export function verificationDocKey(userId: string, uuid: string): string {
  const env = process.env.NODE_ENV ?? "development";
  return `${env}/users/${userId}/verification/${uuid}.pdf`;
}

export function contractHardcopyKey(tenderId: number): string {
  const env = process.env.NODE_ENV ?? "development";
  return `${env}/tenders/${tenderId}/contract/hardcopy.pdf`;
}

export function contractPdfKey(tenderId: number): string {
  const env = process.env.NODE_ENV ?? "development";
  return `${env}/tenders/${tenderId}/contract/contract.pdf`;
}

export function completionCertKey(tenderId: number): string {
  const env = process.env.NODE_ENV ?? "development";
  return `${env}/tenders/${tenderId}/completion/certificate.pdf`;
}
