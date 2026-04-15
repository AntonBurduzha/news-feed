import { Router } from 'express';
import { createFollow, deleteFollow, getFollowersByFollowingId } from './follow.controller';
import {
	createFollowRequestSchema,
	deleteFollowRequestSchema,
	followersByFollowingIdRequestSchema,
} from './follow.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createFollowRequestSchema), createFollow);

router
	.route('/:id')
	.get(validate(followersByFollowingIdRequestSchema), getFollowersByFollowingId)
	.delete(validate(deleteFollowRequestSchema), deleteFollow);

export default router;
