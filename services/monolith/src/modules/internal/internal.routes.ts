import { Router } from 'express';
import { internalAuth } from '@/middleware/internal-auth';
import { validate } from '@/middleware/validate';
import {
	getFollowingByFollowerId,
	getFollowersByFollowingId,
	getPostsByAuthors,
	getUsersByIds,
} from './internal.controller';
import { getPostsByAuthorsRequestSchema } from './internal.schemas';

const router = Router();
router.use(internalAuth);

router.get('/follows/:userId/following', getFollowingByFollowerId);

router.get('/follows/:userId/followers', getFollowersByFollowingId);

router.post('/posts/by-authors', validate(getPostsByAuthorsRequestSchema), getPostsByAuthors);

router.post('/users', getUsersByIds);

export default router;
