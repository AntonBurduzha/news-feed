import { Router } from 'express';
import { createPost, deletePost, getPost, getPosts, updatePost } from './posts.controller';
import {
	createPostRequestSchema,
	updatePostRequestSchema,
	postIdRequestSchema,
} from './posts.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createPostRequestSchema), createPost).get(getPosts);

router
	.route('/:id')
	.get(validate(postIdRequestSchema), getPost)
	.put(validate(updatePostRequestSchema), updatePost)
	.delete(validate(postIdRequestSchema), deletePost);

export default router;
