function getAbortError(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error('Aborted', { cause: signal.reason });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(getAbortError(signal));
			return;
		}

		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);

		const onAbort = (): void => {
			clearTimeout(timer);
			reject(getAbortError(signal!));
		};

		signal?.addEventListener('abort', onAbort, { once: true });
	});
}
