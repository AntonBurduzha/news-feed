import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
	POSTGRES_DB_HOST: z.string().min(1),
	POSTGRES_DB_PORT: z.coerce.number().int().positive().default(5432),
	POSTGRES_DB_USER: z.string().min(1),
	POSTGRES_DB_PASSWORD: z.string().min(1),
	POSTGRES_DB_NAME: z.string().min(1),
	MONGO_DB_HOST: z.string().min(1),
	MONGO_DB_PORT: z.coerce.number().int().positive().default(27017),
	MONGO_DB_USER: z.string().min(1),
	MONGO_DB_PASSWORD: z.string().min(1),
	MONGO_DB_NAME: z.string().min(1),
	HOST_IP: z.string().min(1).optional(),
	KAFKA_NEWS_FEED_SERVICE_CLIENT_ID: z.string().min(5),
	KAFKA_BROKERS: z.string().optional(),
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
	KAFKA_BROKERS: kafkaBrokers?.length
		? kafkaBrokers
		: [`${parsedEnv.data.HOST_IP ?? '127.0.0.1'}:9092`],
	isProduction: parsedEnv.data.NODE_ENV === 'production',
} as const;
