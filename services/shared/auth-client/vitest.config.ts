import { defineConfig } from 'vitest/config';

export default defineConfig({
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
					sequence: { groupOrder: 0 },
				},
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.int.test.ts'],
					pool: 'forks',
					maxWorkers: 1,
					isolate: false,
					testTimeout: 60_000,
					hookTimeout: 90_000,
					sequence: { groupOrder: 1 },
				},
			},
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.ts'],
			thresholds: { lines: 80 },
		},
	},
});
