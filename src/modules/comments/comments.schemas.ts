import { z } from 'zod';

export const createCommentRequestSchema = z.object({
	body: z.object({
		postId: z.number().int().positive(),
		author: z.object({
			userId: z.number().int().positive(),
			name: z.string().trim().min(1),
			avatarUrl: z.string().nullable(),
		}),
		content: z.string().trim().min(1).max(280),
	}),
});

export const deleteCommentRequestSchema = z.object({
	params: z.object({
		id: z.string().trim().min(1),
	}),
});

export const deleteCommentsRequestSchema = z.object({
	body: z.object({
		postIds: z.array(z.number()),
	}),
});
