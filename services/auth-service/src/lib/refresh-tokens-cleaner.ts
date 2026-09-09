import { backgroundSupervisor } from '@/lib/background-supervisor';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { authService } from '@/modules/auth/auth.service';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_START_JITTER_MS = 60_000;

let startTimer: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let inFlightCleanup: Promise<void> | null = null;

function runCleanup(): void {
	if (inFlightCleanup) {
		return;
	}
	const cleanup = authService
		.deleteExpiredTokens()
		.then(deletedCount => {
			if (deletedCount > 0) {
				logger.info({ deletedCount }, 'Deleted expired refresh tokens');
			}
		})
		.catch(err => {
			logger.error({ err: normalizeError(err) }, 'Failed to delete expired refresh tokens');
		});

	inFlightCleanup = cleanup;
	void cleanup.finally(() => {
		if (inFlightCleanup === cleanup) {
			inFlightCleanup = null;
		}
	});
}

async function startCleanerLoop(): Promise<void> {
	if (startTimer ?? cleanupInterval) {
		return;
	}

	startTimer = setTimeout(
		() => {
			startTimer = null;
			runCleanup();
			cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
			cleanupInterval.unref();
		},
		Math.floor(Math.random() * MAX_START_JITTER_MS),
	);
	startTimer.unref();
}

async function stopCleanerLoop(): Promise<void> {
	if (startTimer) {
		clearTimeout(startTimer);
		startTimer = null;
	}
	if (cleanupInterval) {
		clearInterval(cleanupInterval);
		cleanupInterval = null;
	}

	await inFlightCleanup;
	inFlightCleanup = null;
}

export function startRefreshTokensCleaner(): void {
	backgroundSupervisor.start({
		name: 'Refresh token cleaner',
		run: startCleanerLoop,
		cleanup: stopCleanerLoop,
	});
}
