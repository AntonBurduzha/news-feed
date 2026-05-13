import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['**/dist/**', '**/node_modules/**', '.npm-cache/**', 'eslint.config.js'],
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				project: [
					'./tsconfig.json',
					'./services/monolith/tsconfig.json',
					'./services/comments-service/tsconfig.json',
					'./services/auth-service/tsconfig.json',
					'./services/shared/contracts/tsconfig.json',
					'./services/shared/auth-client/tsconfig.json',
				],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/require-await': 'off',
		},
	},
);
