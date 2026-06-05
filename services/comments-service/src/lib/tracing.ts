import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { env } from '@/config/env';

// OTEL_* env vars are the standard config surface; fallback for local Alloy on port 4317
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';

// Head-based sampling: OTEL_TRACES_SAMPLER_ARG=1.0 in dev, 0.2 in prod (20% of traces kept)
const sampleRatio = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? '1.0');

const sdk = new NodeSDK({
	serviceName: env.SERVICE_NAME,
	sampler: new ParentBasedSampler({
		root: new TraceIdRatioBasedSampler(sampleRatio),
	}),
	// OTLPTraceExporter batches spans and sends via gRPC into Tempo
	traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-fs': { enabled: false }, // reduce noise
			'@opentelemetry/instrumentation-express': { enabled: true }, // HTTP routes
			'@opentelemetry/instrumentation-http': { enabled: true }, // outbound fetch
			'@opentelemetry/instrumentation-pg': { enabled: true }, // Postgres queries
			'@opentelemetry/instrumentation-redis': { enabled: true }, // Redis get/set (JWKS cache)
			'@opentelemetry/instrumentation-kafkajs': { enabled: true }, // injects traceparent into Kafka headers
		}),
	],
});

sdk.start();

process.on('SIGTERM', () => {
	void sdk.shutdown();
});
