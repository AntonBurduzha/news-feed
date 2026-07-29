import { BackgroundSupervisor } from '@news-feed/runtime';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { backgroundServiceUp } from '@/lib/metrics';

export const backgroundSupervisor = new BackgroundSupervisor({
	logger: {
		info: (obj, msg) => logger.info(obj, msg),
		warn: (obj, msg) => logger.warn(obj, msg),
		error: (obj, msg) => logger.error(obj, msg),
	},
});

export function startSupervisorMetrics(): void {
	const publish = (): void => {
		for (const [name, status] of Object.entries(backgroundSupervisor.getStatuses())) {
			backgroundServiceUp.set(
				{ background_service: name, service: env.SERVICE_NAME },
				status === 'running' ? 1 : 0,
			);
		}
	};
	publish();

	setInterval(publish, 15_000).unref();
}
