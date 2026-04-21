import { Router } from 'express';
import mongoose from 'mongoose';
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
		if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
			throw new Error('MongoDB is not connected');
		}

		res.json({
			status: 'ready',
		});
	}),
);

export default router;
