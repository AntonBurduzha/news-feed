import { z } from 'zod';

const getPostsByAuthorsRequestBodySchema = z.object({
	ids: z.array(z.uuid()).max(500),
	limit: z.coerce.number().int().min(1).max(10).optional(),
	cursor: z.string().nullable().optional(),
});

export const getPostsByAuthorsRequestSchema = z.object({
	body: getPostsByAuthorsRequestBodySchema,
});

export type GetPostsByAuthorsRequest = z.infer<typeof getPostsByAuthorsRequestBodySchema>;
