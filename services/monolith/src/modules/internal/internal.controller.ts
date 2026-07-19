import type { RequestHandler } from 'express';
import { asyncHandler } from '@/lib/async-handler';
import { followService } from '@/modules/follow/follow.service';
import { postService } from '@/modules/posts/posts.service';
import { userService } from '@/modules/users/users.service';
import type { GetPostsByAuthorsRequest } from './internal.schemas';

export const getFollowingByFollowerId: RequestHandler = asyncHandler(async (req, res) => {
	const { userId } = req.params as { userId: string };
	const following = await followService.getFollowingByFollowerId(userId);
	res.json(following);
});

export const getFollowersByFollowingId: RequestHandler = asyncHandler(async (req, res) => {
	const { userId } = req.params as { userId: string };
	const followers = await followService.getFollowersByFollowingId(userId);
	res.json(followers);
});

export const getPostsByAuthors: RequestHandler = asyncHandler(async (req, res) => {
	const { ids, limit, cursor } = req.body as GetPostsByAuthorsRequest;
	const result = await postService.getPostsByAuthors(ids, limit ?? 10, cursor ?? null);
	res.json(result);
});

export const getUsersByIds: RequestHandler = asyncHandler(async (req, res) => {
	const { ids } = req.body as { ids: string[] };
	const users = await userService.getUsersByIds(ids);
	res.json(users);
});
