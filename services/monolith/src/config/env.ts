import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	OUTBOX_RELAY_PORT: z.coerce.number().int().positive().default(3010),
	OUTBOX_RELAY_SERVICE_NAME: z.string().min(1).default('outbox-relay'),
	DLQ_REDRIVE_PORT: z.coerce.number().int().positive().default(3011),
	DLQ_REDRIVE_SERVICE_NAME: z.string().min(1).default('dlq-redrive'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
	SERVICE_NAME: z.string().min(1).default('news-feed-monolith'),
	COMMENTS_SVC_URL: z.string().min(1).default('http://localhost:3001'),
	POSTGRES_DB_HOST: z.string().min(1),
	POSTGRES_DB_PORT: z.coerce.number().int().positive().default(5432),
	POSTGRES_DB_USER: z.string().min(1),
	POSTGRES_DB_PASSWORD: z.string().min(1),
	POSTGRES_DB_NAME: z.string().min(1),
	REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
	AUTH_JWKS_URL: z.string().min(1).default('http://localhost:3002/.well-known/jwks.json'),
	AUTH_ISSUER: z.string().min(1).default('auth-svc'),
	AUTH_AUDIENCE: z.string().min(1).default('news-feed'),
	KAFKA_NEWS_FEED_SERVICE_CLIENT_ID: z.string().min(5),
	KAFKA_BROKERS: z.string().optional(),
	AWS_REGION: z.string().min(1),
	AWS_BUCKET_NAME: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}`);
}

const kafkaBrokers = parsedEnv.data.KAFKA_BROKERS?.split(',')
	.map(broker => broker.trim())
	.filter(Boolean);

export const env = {
	...parsedEnv.data,
	KAFKA_BROKERS: kafkaBrokers?.length ? kafkaBrokers : ['127.0.0.1:9092'],
	isProduction: parsedEnv.data.NODE_ENV === 'production',
} as const;
