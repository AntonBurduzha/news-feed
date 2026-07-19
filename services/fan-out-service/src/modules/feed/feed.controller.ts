import type { Request, RequestHandler } from 'express';
import type { UserContext } from '@news-feed/auth-client';
import { asyncHandler } from '@/lib/async-handler';
import { feedService } from './feed.service';

export const getFeed: RequestHandler = asyncHandler(async (req, res) => {
	const { userId } = (req as Request & { user: UserContext }).user;
	const cursor = (req.query.cursor as string | undefined) ?? null;
	const feed = await feedService.getFeed(userId, cursor);
	res.json(feed);
});
