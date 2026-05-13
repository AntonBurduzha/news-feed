import { z } from 'zod';

export const registerSchema = z.object({
	body: z.object({
		email: z.email(),
		password: z.string().min(8).max(32),
	}),
});

export const loginSchema = z.object({
	body: z.object({
		email: z.string().email(),
		password: z.string().min(1),
	}),
});

export const refreshSchema = z.object({
	body: z.object({
		refreshToken: z.string().min(1),
	}),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
