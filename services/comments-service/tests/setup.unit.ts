import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.MONGO_DB_HOST = 'localhost';
process.env.MONGO_DB_PORT = '27017';
process.env.MONGO_DB_USER = 'test';
process.env.MONGO_DB_PASSWORD = 'test';
process.env.MONGO_DB_NAME = 'test';
process.env.KAFKA_BROKERS = 'localhost:9092';

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
