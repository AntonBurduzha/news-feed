import { describe, test, expect, vi } from 'vitest';
import { defaultAuthClientCfg } from '../fixtures/tokens.js';

const { mockClient } = vi.hoisted(() => {
	const mockClient = {
		connect: vi.fn(() => Promise.resolve()),
		quit: vi.fn(() => Promise.resolve()),
		set: vi.fn(() => Promise.resolve()),
		get: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
		on: vi.fn(),
		isOpen: false,
	};
	return { mockClient };
});

vi.mock('redis', () => ({
	createClient: vi.fn(() => mockClient),
}));

import { createAuthClient } from '../../src/index.js';

describe('createAuthClient.disconnect', () => {
	test('calls redis quit', async () => {
		const client = createAuthClient(defaultAuthClientCfg);
		await client.disconnect();
		expect(mockClient.quit).toHaveBeenCalled();
	});

	test('logs disconnect errors via injected logger', async () => {
		const logError = vi.fn();
		mockClient.quit.mockRejectedValueOnce(new Error('quit failed'));
		const client = createAuthClient({ ...defaultAuthClientCfg, logger: { error: logError } });

		await client.disconnect();

		expect(logError).toHaveBeenCalledWith(
			{ err: expect.any(Error) as Error },
			'Redis disconnect error',
		);
	});
});
