import { Router } from 'express';
import { internalAuth } from '@/middleware/internal-auth';
import {
	getFollowingByFollowerId,
	getFollowersByFollowingId,
	getLatestPostsByAuthors,
	getUsersByIds,
} from './internal.controller';

const router = Router();
router.use(internalAuth);

router.get('/follows/:userId/following', getFollowingByFollowerId);

router.get('/follows/:userId/followers', getFollowersByFollowingId);

router.post('/posts/by-authors', getLatestPostsByAuthors);

router.post('/users', getUsersByIds);

export default router;
