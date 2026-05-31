import { Router } from 'express';
import healthRoute from './health.route';
import jwksRoute from './jwks.route';
import metricsRoute from './metrics.route';
import authRoutes from '@/modules/auth/auth.routes';

const router = Router();

router.use(healthRoute);
router.use(metricsRoute);
router.use(jwksRoute);
router.use('/auth', authRoutes);

export default router;
