import { z } from 'zod';

const postBodySchema = z.object({
	userId: z.uuid(),
	content: z.string().trim().min(1).max(280),
});

export const createPostRequestSchema = z.object({
	body: postBodySchema,
});

export const postsQuerySchema = z.object({
	query: z.object({
		cursor: z.string().optional(),
		limit: z.coerce.number().int().positive().optional(),
		userId: z.uuid(),
	}),
});

export const updatePostRequestSchema = z.object({
	body: postBodySchema,
	params: z.object({
		id: z.uuid(),
	}),
});

export const postIdRequestSchema = z.object({
	params: z.object({
		id: z.uuid(),
	}),
});
