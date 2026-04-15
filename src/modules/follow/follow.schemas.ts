import { z } from 'zod';

export const createFollowRequestSchema = z.object({
	body: z.object({
		followerId: z.number().int().positive(),
		followingId: z.number().int().positive(),
	}),
});

export const followersByFollowingIdRequestSchema = z.object({
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});

export const deleteFollowRequestSchema = z.object({
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});
