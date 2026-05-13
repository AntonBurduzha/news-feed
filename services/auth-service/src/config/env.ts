import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3002),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
	SERVICE_NAME: z.string().min(1).default('auth-svc'),
	POSTGRES_DB_HOST: z.string().min(1),
	POSTGRES_DB_PORT: z.coerce.number().int().positive().default(5432),
	POSTGRES_DB_USER: z.string().min(1),
	POSTGRES_DB_PASSWORD: z.string().min(1),
	POSTGRES_DB_NAME: z.string().min(1),
	REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
	JWT_ISSUER: z.string().min(1).default('auth-svc'),
	JWT_AUDIENCE: z.string().min(1).default('news-feed'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}`);
}

export const env = {
	...parsedEnv.data,
	isProduction: parsedEnv.data.NODE_ENV === 'production',
} as const;
