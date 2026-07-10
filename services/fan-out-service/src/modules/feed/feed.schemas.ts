import { z } from 'zod';

export const getFeedRequestSchema = z.object({
	query: z.object({
		limit: z.coerce.number().int().positive().max(50).optional(),
		cursor: z.string().optional(),
	}),
});
