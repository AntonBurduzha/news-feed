import { Router } from 'express';
import { createComment, deleteComment, getComments } from './comments.controller';
import { createCommentRequestSchema, deleteCommentRequestSchema } from './comments.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createCommentRequestSchema), createComment);

router.route('/:id').delete(validate(deleteCommentRequestSchema), deleteComment);

router.route('/:postId').get(getComments);

export default router;
