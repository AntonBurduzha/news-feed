import { Router } from 'express';

const router = Router();

// INFO: test 500 error
router.get('/debug/force-error', (_req, res) => res.status(500).json({ error: 'test' }));

export default router;
