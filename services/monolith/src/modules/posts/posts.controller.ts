import type { RequestHandler } from 'express';
import httpStatus from 'http-status';
import { asyncHandler } from '@/lib/async-handler';
import { actorId } from '@/lib/actor';
import { postService } from './posts.service';

export const createPost: RequestHandler = asyncHandler(async (req, res) => {
	const { content } = req.body as { content: string };
	const post = await postService.createPost({ userId: actorId(req), content });
	res.status(httpStatus.CREATED).json(post);
});

export const getPost: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	const post = await postService.getPost(id);
	res.json(post);
});

export const updatePost: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	const { content } = req.body as { content: string };
	const post = await postService.updatePost(id, { content }, actorId(req));
	res.json(post);
});

export const deletePost: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	await postService.deletePost(id, actorId(req));
	res.status(httpStatus.NO_CONTENT).send();
});
