import { register } from 'node:module';
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { env } from '@/config/env';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';
const sampleRatio = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? '1.0');

const INFRA_PATHS = new Set(['/metrics', '/healthz', '/readyz']);

const sdk = new NodeSDK({
	serviceName: process.env.OTEL_SERVICE_NAME ?? env.SERVICE_NAME,
	sampler: new ParentBasedSampler({
		root: new TraceIdRatioBasedSampler(sampleRatio),
	}),
	traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-fs': { enabled: false },
			'@opentelemetry/instrumentation-express': { enabled: true },
			'@opentelemetry/instrumentation-http': {
				enabled: true,
				ignoreIncomingRequestHook: req => {
					const path = (req.url ?? '').split('?')[0];
					return INFRA_PATHS.has(path);
				},
			},
			'@opentelemetry/instrumentation-pg': { enabled: true },
			'@opentelemetry/instrumentation-redis': { enabled: true },
			'@opentelemetry/instrumentation-kafkajs': { enabled: false },
		}),
	],
});

sdk.start();

process.on('SIGTERM', () => {
	void sdk.shutdown();
});
