import { z } from 'zod';

const postBodySchema = z.object({
	userId: z.number().int().positive(),
	content: z.string().trim().min(1).max(280),
});

export const createPostRequestSchema = z.object({
	body: postBodySchema,
});

export const updatePostRequestSchema = z.object({
	body: postBodySchema,
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});

export const postIdRequestSchema = z.object({
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});
