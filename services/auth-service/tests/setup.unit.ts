import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.POSTGRES_DB_HOST = 'localhost';
process.env.POSTGRES_DB_USER = 'test';
process.env.POSTGRES_DB_PASSWORD = 'test';
process.env.POSTGRES_DB_NAME = 'test';
process.env.JWT_ISSUER = 'auth-svc';
process.env.JWT_AUDIENCE = 'news-feed';

vi.mock('@opentelemetry/api', async importOriginal => {
	const actual = await importOriginal<typeof import('@opentelemetry/api')>();
	const noopSpan = {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		addEvent: vi.fn(),
		end: vi.fn(),
		spanContext: () => ({ traceId: 'test-trace', spanId: 'test-span' }),
	};
	return {
		...actual,
		trace: {
			...actual.trace,
			getTracer: () => ({ startSpan: () => noopSpan }),
			getActiveSpan: () => noopSpan,
			setSpan: actual.trace.setSpan,
		},
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});
