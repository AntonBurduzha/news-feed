import { AVATAR_ALLOWED_MIME, AVATAR_MAX_BYTES } from '@/middleware/upload';
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
	}),
	params: z.object({
		id: z.uuid(),
	}),
});

export const userIdRequestSchema = z.object({
	params: z.object({
		id: z.uuid(),
	}),
});

export const uploadAvatarRequestSchema = z.object({
	params: z.object({
		id: z.uuid(),
	}),
	file: z
		.object({
			mimetype: z.enum(AVATAR_ALLOWED_MIME),
			size: z.number().max(AVATAR_MAX_BYTES, 'File size should not exceed 1MB'),
			buffer: z.instanceof(Buffer),
			originalname: z.string(),
		})
		.loose(),
});
