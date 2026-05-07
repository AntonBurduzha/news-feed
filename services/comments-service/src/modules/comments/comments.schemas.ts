import { z } from 'zod';
import { createCommentRequest, deleteCommentParams } from '@news-feed/contracts';

export const createCommentRequestSchema = z.object({
	body: createCommentRequest,
});

export const deleteCommentRequestSchema = z.object({
	params: deleteCommentParams,
});
