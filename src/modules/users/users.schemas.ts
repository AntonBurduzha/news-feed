import { z } from 'zod';

export const createUserRequestSchema = z.object({
	body: z.object({
		email: z.email(),
	}),
});

export const updateUserRequestSchema = z.object({
	body: z.object({
		name: z.string().trim().min(3).max(30),
		email: z.email(),
		avatarUrl: z.string().trim().optional(),
	}),
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});

export const userIdRequestSchema = z.object({
	params: z.object({
		id: z.coerce.number().int().positive(),
	}),
});
