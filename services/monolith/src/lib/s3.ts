import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/config/env';

// INFO: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY automatically resolved from env vars
export const s3 = new S3Client({ region: env.AWS_REGION });

type PutObjectParams = {
	key: string;
	body: Buffer;
	contentType: string;
};

class S3Service {
	private readonly s3 = new S3Client({ region: env.AWS_REGION });

	async putObject({ key, body, contentType }: PutObjectParams): Promise<string> {
		await this.s3.send(
			new PutObjectCommand({
				Bucket: env.AWS_BUCKET_NAME,
				Key: key,
				Body: body,
				ContentType: contentType,
				CacheControl: 'public, max-age=31536000, immutable',
			}),
		);
		return `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
	}

	async deleteObject(key: string): Promise<void> {
		await this.s3.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
	}
}

export default new S3Service();
