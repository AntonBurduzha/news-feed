import { z } from 'zod';

export const getFeedRequestSchema = z.object({
	query: z.object({
		cursor: z.string().optional(),
	}),
});
