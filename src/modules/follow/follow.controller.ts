import type { RequestHandler } from 'express';
import httpStatus from 'http-status';
import { asyncHandler } from '@/lib/async-handler';
import { followService } from './follow.service';
import type { CreateFollowInput } from './follow.types';

export const createFollow: RequestHandler = asyncHandler(async (req, res) => {
	const followData = req.body as CreateFollowInput;
	const follow = await followService.createFollow(followData);
	res.status(httpStatus.CREATED).json(follow);
});

export const getFollowersByFollowingId: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const followers = await followService.getFollowersByFollowingId(Number(id));
	res.json(followers);
});

export const deleteFollow: RequestHandler = asyncHandler(async (req, res) => {
	await followService.deleteFollow(Number(req.params.id));
	res.status(httpStatus.NO_CONTENT).send();
});
