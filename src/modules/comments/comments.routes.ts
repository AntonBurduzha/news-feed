import { Router } from 'express';
import { createComment, deleteComment, getComments, deleteComments } from './comments.controller';
import {
	deleteCommentsRequestSchema,
	createCommentRequestSchema,
	deleteCommentRequestSchema,
} from './comments.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createCommentRequestSchema), createComment);

router.route('/:id').delete(validate(deleteCommentRequestSchema), deleteComment);

router.route('/:postId').get(getComments);

router.route('/batch-delete').post(validate(deleteCommentsRequestSchema), deleteComments);

export default router;
