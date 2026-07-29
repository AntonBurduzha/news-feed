import { computeBackoffDelayMs, type BackoffOptions } from './backoff.js';
import { sleep } from './sleep.js';

export type RuntimeLogger = {
	info: (obj: Record<string, unknown>, msg: string) => void;
	warn: (obj: Record<string, unknown>, msg: string) => void;
	error: (obj: Record<string, unknown>, msg: string) => void;
	debug?: (obj: Record<string, unknown>, msg: string) => void;
};

export type BackgroundServiceStatus = 'starting' | 'running' | 'retrying' | 'stopped';

export type UnhealthyPolicy = 'report' | 'restart';

export type BackgroundServiceSpec = {
	name: string;
	run: (signal: AbortSignal) => Promise<void>;
	check?: () => boolean | Promise<boolean>;
	checkIntervalMs?: number;
	unhealthyThreshold?: number;
	onUnhealthy?: UnhealthyPolicy;
	cleanup?: () => Promise<void>;
	backoff?: BackoffOptions;
};

export type BackgroundSupervisorOptions = {
	logger: RuntimeLogger;
	backoff?: BackoffOptions;
	stopGracePeriodMs?: number;
};

type ManagedService = BackgroundServiceSpec & {
	status: BackgroundServiceStatus;
	attempt: number;
	loopPromise: Promise<void> | null;
};

export class BackgroundSupervisor {
	private readonly logger: RuntimeLogger;
	private readonly backoff: BackoffOptions;
	private readonly stopGracePeriodMs: number;
	private readonly abortController = new AbortController();
	private readonly services = new Map<string, ManagedService>();
	private stopped = false;

	constructor(options: BackgroundSupervisorOptions) {
		this.logger = options.logger;
		this.backoff = options.backoff ?? {};
		this.stopGracePeriodMs = options.stopGracePeriodMs ?? 5_000;
	}

	start(spec: BackgroundServiceSpec): void {
		if (this.stopped) {
			throw new Error('BackgroundSupervisor is stopped');
		}
		if (this.services.has(spec.name)) {
			throw new Error(`Background service "${spec.name}" is already registered`);
		}

		const managed: ManagedService = {
			...spec,
			status: 'starting',
			attempt: 0,
			loopPromise: null,
		};

		this.services.set(spec.name, managed);
		managed.loopPromise = this.runLoop(managed).catch(error => {
			if (!this.abortController.signal.aborted) {
				this.logger.error(
					{ err: error, serviceName: spec.name },
					'Background service loop crashed',
				);
			}
		});
	}

	getStatus(name: string): BackgroundServiceStatus | undefined {
		return this.services.get(name)?.status;
	}

	getStatuses(): Record<string, BackgroundServiceStatus> {
		return Object.fromEntries(
			[...this.services.entries()].map(([name, service]) => [name, service.status]),
		);
	}

	isShuttingDown(): boolean {
		return this.stopped;
	}

	private async runLoop(service: ManagedService): Promise<void> {
		while (!this.isShuttingDown()) {
			service.attempt += 1;
			service.status = 'starting';

			try {
				this.logger.info(
					{ serviceName: service.name, attempt: service.attempt },
					'Starting background service',
				);
				await service.run(this.abortController.signal);
				if (this.isShuttingDown()) {
					return;
				}

				service.status = 'running';
				service.attempt = 0;
				this.logger.info({ serviceName: service.name }, 'Background service started');
				if (!service.check) {
					return;
				}

				await this.watch(service);
				if (this.isShuttingDown()) {
					return;
				}

				throw new Error(`Background service "${service.name}" failed its health check`);
			} catch (error) {
				if (this.isShuttingDown()) {
					return;
				}

				service.status = 'retrying';
				const delayMs = computeBackoffDelayMs(service.attempt, service.backoff ?? this.backoff);

				this.logger.warn(
					{ err: error, serviceName: service.name, attempt: service.attempt, delayMs },
					'Background service unavailable, retrying',
				);

				await this.runCleanup(service, 'before retry');

				try {
					await sleep(delayMs, this.abortController.signal);
				} catch {
					return;
				}
			}
		}
	}

	private async watch(service: ManagedService): Promise<void> {
		const intervalMs = service.checkIntervalMs ?? 10_000;
		const threshold = service.unhealthyThreshold ?? 3;
		const policy = service.onUnhealthy ?? 'report';
		let consecutiveFailures = 0;

		while (!this.isShuttingDown()) {
			try {
				await sleep(intervalMs, this.abortController.signal);
			} catch {
				return;
			}
			if (this.isShuttingDown()) {
				return;
			}

			let healthy: boolean;
			try {
				healthy = await service.check!();
			} catch (error) {
				this.logger.warn(
					{ err: error, serviceName: service.name },
					'Background service health check threw',
				);
				healthy = false;
			}

			if (healthy) {
				if (consecutiveFailures > 0) {
					this.logger.info(
						{ serviceName: service.name, afterFailures: consecutiveFailures },
						'Background service recovered',
					);
				}
				consecutiveFailures = 0;
				service.status = 'running';
				continue;
			}

			consecutiveFailures += 1;
			service.status = 'retrying';
			this.logger.warn(
				{ serviceName: service.name, consecutiveFailures, threshold, policy },
				'Background service health check failed',
			);

			if (policy === 'restart' && consecutiveFailures >= threshold) {
				return;
			}
		}
	}

	private async runCleanup(service: ManagedService, phase: string): Promise<void> {
		if (!service.cleanup) {
			return;
		}
		await service.cleanup().catch(error => {
			this.logger.error(
				{ err: error, serviceName: service.name, phase },
				'Background service cleanup failed',
			);
		});
	}

	async stop(): Promise<void> {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.abortController.abort();

		await Promise.allSettled(
			[...this.services.values()].map(async service => {
				service.status = 'stopped';

				const finished = await this.awaitLoop(service);
				if (!finished) {
					this.logger.warn(
						{ serviceName: service.name, stopGracePeriodMs: this.stopGracePeriodMs },
						'Background service did not stop within the grace period',
					);
				}
				await this.runCleanup(service, 'during stop');
			}),
		);
	}

	private async awaitLoop(service: ManagedService): Promise<boolean> {
		if (!service.loopPromise) {
			return true;
		}
		const graceController = new AbortController();
		return Promise.race([
			service.loopPromise.then(() => {
				graceController.abort();
				return true;
			}),
			sleep(this.stopGracePeriodMs, graceController.signal).then(
				() => false,
				() => true,
			),
		]);
	}
}
