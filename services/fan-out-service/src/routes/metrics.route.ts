import { Router } from 'express';
import client from 'prom-client';

const router = Router();

router.get('/metrics', async (_req, res) => {
	res.set('Content-Type', client.register.contentType);
	res.end(await client.register.metrics()); // serialize all registered metriccs for prometheus text format
});

export default router;
