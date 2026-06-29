import { vi, beforeEach } from 'vitest';
import { register } from 'prom-client';

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
	register.clear();
});
