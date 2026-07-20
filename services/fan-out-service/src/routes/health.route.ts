import { Router } from 'express';
import { backgroundSupervisor } from '@/index';
import { asyncHandler } from '@/lib/async-handler';

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
		res.json({ status: 'ready', backgroundSupervisorStatus: backgroundSupervisor.getStatuses() });
	}),
);

export default router;
