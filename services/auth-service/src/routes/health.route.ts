import { Router } from 'express';
import { asyncHandler } from '@/lib/async-handler';
import { checkPostgresConnection } from '@/db/postgres';

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
		await checkPostgresConnection();
		res.json({ status: 'ready' });
	}),
);

export default router;
