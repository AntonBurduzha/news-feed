import { isRetryable } from '@/lib/errors';

export async function withRetry<T>(
	fn: () => Promise<T>,
	{ attempts = 3, baseDelayMs = 200 } = {},
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isRetryable(error) || attempt === attempts) throw error;
			await new Promise(r => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
		}
	}
	throw lastError;
}
