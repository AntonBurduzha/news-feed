import { Router } from 'express';
import { createPost, deletePost, getPost, updatePost } from './posts.controller';
import {
	createPostRequestSchema,
	updatePostRequestSchema,
	postIdRequestSchema,
} from './posts.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createPostRequestSchema), createPost);

router
	.route('/:id')
	.get(validate(postIdRequestSchema), getPost)
	.put(validate(updatePostRequestSchema), updatePost)
	.delete(validate(postIdRequestSchema), deletePost);

export default router;
