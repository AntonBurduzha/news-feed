import { z } from 'zod';

export const createFollowRequestSchema = z.object({
	body: z.object({
		followingId: z.uuid(),
	}),
});

export const followersByFollowingIdRequestSchema = z.object({
	params: z.object({
		id: z.uuid(),
	}),
});

export const deleteFollowRequestSchema = z.object({
	params: z.object({
		id: z.uuid(),
	}),
});
