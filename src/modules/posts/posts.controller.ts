import type { RequestHandler } from 'express';
import httpStatus from 'http-status';
import { asyncHandler } from '@/lib/async-handler';
import { postService } from './posts.service';
import type { CreatePostInput, UpdatePostInput, GetPostsQueryParams } from './posts.types';

export const createPost: RequestHandler = asyncHandler(async (req, res) => {
	const postData = req.body as CreatePostInput;
	const post = await postService.createPost(postData);
	res.status(httpStatus.CREATED).json(post);
});

export const getPosts: RequestHandler = asyncHandler(async (_req, res) => {
	const result = await postService.getPosts(_req.query as GetPostsQueryParams);
	res.json(result);
});

export const getPost: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const post = await postService.getPost(Number(id));
	res.json(post);
});

export const updatePost: RequestHandler = asyncHandler(async (req, res) => {
	const post = await postService.updatePost(Number(req.params.id), req.body as UpdatePostInput);
	res.json(post);
});

export const deletePost: RequestHandler = asyncHandler(async (req, res) => {
	await postService.deletePost(Number(req.params.id));
	res.status(httpStatus.NO_CONTENT).send();
});
