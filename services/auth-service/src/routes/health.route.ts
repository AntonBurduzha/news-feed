import { Router } from 'express';
import { asyncHandler } from '@/lib/async-handler';
import { checkPostgresConnection } from '@/db/postgres';
import { backgroundSupervisor } from '@/lib/background-supervisor';
import { isDraining } from '@/lib/lifecycle';

const router = Router();

router.get('/healthz', (_req, res) => {
	res.json({
		status: 'ok',
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
	});
});

router.get(
	'/readyz',
	asyncHandler(async (_req, res) => {
		if (isDraining()) {
			res.status(503).json({ status: 'draining' });
			return;
		}

		const services = backgroundSupervisor.getStatuses();
		const postgresUp = await checkPostgresConnection().then(
			() => true,
			() => false,
		);
		const ready = postgresUp && Object.values(services).every(status => status === 'running');

		res.status(ready ? 200 : 503).json({
			status: ready ? 'ready' : 'degraded',
			services,
			dependencies: { Postgres: postgresUp ? 'up' : 'down' },
		});
	}),
);

export default router;
