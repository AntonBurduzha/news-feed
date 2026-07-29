import type { Logger } from 'pino';
import { BackgroundSupervisor } from '@news-feed/runtime';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { backgroundServiceUp } from '@/lib/metrics';

export function createBackgroundSupervisor(log: Logger): BackgroundSupervisor {
	return new BackgroundSupervisor({
		logger: {
			info: (obj, msg) => log.info(obj, msg),
			warn: (obj, msg) => log.warn(obj, msg),
			error: (obj, msg) => log.error(obj, msg),
		},
	});
}

export function startSupervisorMetrics(
	supervisor: BackgroundSupervisor,
	serviceName: string,
): void {
	const publish = (): void => {
		for (const [name, status] of Object.entries(supervisor.getStatuses())) {
			backgroundServiceUp.set(
				{ background_service: name, service: serviceName },
				status === 'running' ? 1 : 0,
			);
		}
	};
	publish();

	setInterval(publish, 15_000).unref();
}

export const backgroundSupervisor = createBackgroundSupervisor(logger);

export function startMonolithSupervisorMetrics(): void {
	startSupervisorMetrics(backgroundSupervisor, env.SERVICE_NAME);
}
