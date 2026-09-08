import type { CorsOptions } from 'cors';

export function buildCorsOptions(allowedOriginsRaw: string): CorsOptions {
	const allowed = new Set(
		allowedOriginsRaw
			.split(',')
			.map(origin => origin.trim())
			.filter(Boolean),
	);

	return {
		origin(origin, callback) {
			if (!origin) return callback(null, true);
			if (allowed.has(origin)) return callback(null, true);

			return callback(null, false);
		},
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
		exposedHeaders: ['x-correlation-id'],
		maxAge: 600,
	};
}
