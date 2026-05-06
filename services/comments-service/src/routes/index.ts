import { Router } from 'express';
import healthRoute from './health.route';
import commentRoutes from '@/modules/comments/comments.routes';

const router = Router();

router.use(healthRoute);
router.use('/comments', commentRoutes);

export default router;
