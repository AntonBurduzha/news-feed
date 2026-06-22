import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		globals: true,
		environment: 'node',
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.unit.test.ts'],
					setupFiles: ['./tests/setup.unit.ts'],
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
				'src/db/mongo/models/**',
				'src/index.ts',
			],
			thresholds: { lines: 50 },
		},
	},
});
