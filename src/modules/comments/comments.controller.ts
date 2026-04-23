import type { RequestHandler } from 'express';
import httpStatus from 'http-status';
import { asyncHandler } from '@/lib/async-handler';
import { commentsService } from './comments.service';
import { CreateCommentInput, GetCommentsInput, DeleteCommentsInput } from './comments.types';

export const createComment: RequestHandler = asyncHandler(async (req, res) => {
	const commentData = req.body as CreateCommentInput;
	const comment = await commentsService.createComment(commentData);
	res.status(httpStatus.CREATED).json(comment);
});

export const getComments: RequestHandler = asyncHandler(async (req, res) => {
	const { postId } = req.params as { postId: string };
	const { limit, cursor } = req.query as GetCommentsInput;
	const comments = await commentsService.getComments(postId, { limit, cursor });
	res.json(comments);
});

export const deleteComment: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	await commentsService.deleteComment(id);
	res.status(httpStatus.NO_CONTENT).send({});
});

export const deleteComments: RequestHandler = asyncHandler(async (req, res) => {
	const postIds = (req.body as DeleteCommentsInput).postIds;
	await commentsService.deleteCommentsByPostIds(postIds);
	res.status(httpStatus.NO_CONTENT).send({});
});
