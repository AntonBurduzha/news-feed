import { Router } from 'express';
import healthRoute from './health.route';
import userRoutes from '@/modules/users/users.routes';
import postRoutes from '@/modules/posts/posts.routes';
import followRoutes from '@/modules/follow/follow.routes';
import commentProxy from '@/modules/comments/comments.proxy';

const router = Router();

router.use(healthRoute);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/follows', followRoutes);
router.use('/comments', commentProxy);

export default router;
