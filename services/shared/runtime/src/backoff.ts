export type BackoffOptions = {
	initialDelayMs?: number;
	maxDelayMs?: number;
	multiplier?: number;
	jitterRatio?: number;
};

const DEFAULTS: Required<BackoffOptions> = {
	initialDelayMs: 2_000,
	maxDelayMs: 30_000,
	multiplier: 2,
	jitterRatio: 0.2,
};

export function computeBackoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
	const { initialDelayMs, maxDelayMs, multiplier, jitterRatio } = { ...DEFAULTS, ...options };
	const exponential = initialDelayMs * multiplier ** Math.max(0, attempt - 1);
	const capped = Math.min(exponential, maxDelayMs);
	const jitter = capped * jitterRatio * (Math.random() * 2 - 1);

	return Math.max(0, Math.round(capped + jitter));
}
