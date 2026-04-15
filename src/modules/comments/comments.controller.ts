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
	const comments = await commentsService.getComments(
		req.params.postId as string,
		req.query as GetCommentsInput,
	);
	res.json(comments);
});

export const deleteComment: RequestHandler = asyncHandler(async (req, res) => {
	await commentsService.deleteComment(req.params.id as string);
	res.status(httpStatus.NO_CONTENT).send({});
});

export const deleteComments: RequestHandler = asyncHandler(async (req, res) => {
	const commentIds = (req.body as DeleteCommentsInput).ids;
	await commentsService.deleteComments(commentIds);
	res.status(httpStatus.NO_CONTENT).send({});
});
