import type { Express } from 'express';

let app: Express | undefined;

export async function getTestApp(): Promise<Express> {
	if (!app) {
		app = (await import('@/app')).default;
	}
	return app;
}
