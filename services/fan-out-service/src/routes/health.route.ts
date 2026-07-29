import { Router } from 'express';
import { backgroundSupervisor } from '@/lib/background-supervisor';

const router = Router();

router.get('/healthz', (_req, res) => {
	res.json({
		status: 'ok',
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
	});
});

router.get('/readyz', (_req, res) => {
	const services = backgroundSupervisor.getStatuses();
	const ready = Object.values(services).every(status => status === 'running');

	res.status(ready ? 200 : 503).json({
		status: ready ? 'ready' : 'degraded',
		services,
	});
});

export default router;
