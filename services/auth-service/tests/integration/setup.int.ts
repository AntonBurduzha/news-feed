import { beforeAll } from 'vitest';
import { startPostgres } from './pg-setup';

process.env.NODE_ENV = 'test';

beforeAll(async () => {
	await startPostgres();
});
