import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		globals: true,
		environment: 'node',
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.unit.test.ts'],
					setupFiles: ['./tests/unit/setup.unit.ts'],
				},
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.int.test.ts'],
					setupFiles: ['./tests/integration/setup.int.ts'],
					globalSetup: ['./tests/integration/redis-setup.ts'],
					pool: 'forks',
					maxWorkers: 1,
					testTimeout: 60_000,
					hookTimeout: 90_000,
				},
			},
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/*.types.ts',
				'src/lib/tracing.ts',
				'src/lib/metrics.ts',
				'src/config/**',
				'src/index.ts',
			],
			thresholds: { lines: 50 },
		},
	},
});
