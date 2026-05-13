import { Router } from 'express';
import { getJWKS } from '@/config/keys';
import { asyncHandler } from '@/lib/async-handler';

const router = Router();

router.get(
	'/.well-known/jwks.json',
	asyncHandler(async (_req, res) => {
		const jwks = await getJWKS();
		res.setHeader('cache-control', 'public, max-age=3600');
		res.json(jwks);
	}),
);

export default router;
