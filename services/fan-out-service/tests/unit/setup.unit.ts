import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.AUTH_JWKS_URL = 'http://localhost:3001/.well-known/jwks.json';
process.env.AUTH_ISSUER = 'auth-svc';
process.env.AUTH_AUDIENCE = 'news-feed';
process.env.KAFKA_NEWS_FEED_SERVICE_CLIENT_ID = 'fan-out-service-test';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.MONOLITH_URL = 'http://localhost:3000';
process.env.INTERNAL_API_KEY = 'test-internal-api-key';

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
