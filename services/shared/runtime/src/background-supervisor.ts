import { computeBackoffDelayMs, type BackoffOptions } from './backoff.js';
import { sleep } from './sleep.js';

export type RuntimeLogger = {
	info: (obj: Record<string, unknown>, msg: string) => void;
	warn: (obj: Record<string, unknown>, msg: string) => void;
	error: (obj: Record<string, unknown>, msg: string) => void;
};

export type BackgroundServiceStatus = 'idle' | 'starting' | 'running' | 'retrying' | 'stopped';

export type BackgroundServiceSpec = {
	name: string;
	mode?: 'once' | 'continuous';
	run: () => Promise<void>;
	cleanup?: () => Promise<void>;
};

export type BackgroundSupervisorOptions = {
	logger: RuntimeLogger;
	backoff?: BackoffOptions;
};

type ManagedService = BackgroundServiceSpec & {
	mode: 'once' | 'continuous';
	status: BackgroundServiceStatus;
	attempt: number;
	loopPromise: Promise<void> | null;
};

export class BackgroundSupervisor {
	private readonly logger: RuntimeLogger;
	private readonly backoff: BackoffOptions;
	private readonly abortController = new AbortController();
	private readonly services = new Map<string, ManagedService>();
	private stopped = false;

	constructor(options: BackgroundSupervisorOptions) {
		this.logger = options.logger;
		this.backoff = options.backoff ?? {};
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
			mode: spec.mode ?? 'once',
			status: 'idle',
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
		return this.stopped || this.abortController.signal.aborted;
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
				if (service.loopPromise) {
					await service.loopPromise.catch(() => {});
				}
				if (service.cleanup) {
					await service.cleanup().catch(error => {
						this.logger.error(
							{ err: error, serviceName: service.name },
							'Background service cleanup failed during stop',
						);
					});
				}
			}),
		);
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
				await service.run();
				service.status = 'running';
				if (service.mode === 'once') {
					this.logger.info({ serviceName: service.name }, 'Background service started');
					return;
				}
				throw new Error(`Continuous background service "${service.name}" exited unexpectedly`);
			} catch (error) {
				if (this.isShuttingDown()) {
					return;
				}

				service.status = 'retrying';
				const delayMs = computeBackoffDelayMs(service.attempt, this.backoff);

				this.logger.warn(
					{ err: error, serviceName: service.name, attempt: service.attempt, delayMs },
					'Background service unavailable, retrying',
				);

				if (service.cleanup) {
					await service.cleanup().catch(cleanupError => {
						this.logger.error(
							{ err: cleanupError, serviceName: service.name },
							'Background service cleanup failed before retry',
						);
					});
				}

				try {
					await sleep(delayMs, this.abortController.signal);
				} catch {
					return;
				}
			}
		}
	}
}
