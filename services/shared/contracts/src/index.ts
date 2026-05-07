import { z } from 'zod';

export const commentAuthor = z.object({
	userId: z.uuid(),
	name: z.string().min(1),
	avatarUrl: z.string().nullable(),
});

export const createCommentRequest = z.object({
	postId: z.uuid(),
	author: commentAuthor,
	content: z.string().min(1).max(280),
});

export const comment = z.object({
	id: z.string(),
	postId: z.string(),
	author: commentAuthor,
	content: z.string(),
	createdAt: z.string(),
});

export const getCommentsResponse = z.object({
	comments: z.array(comment),
	nextCursor: z.string().nullable(),
});

export const deleteCommentParams = z.object({
	id: z.string().min(1),
});

export type CommentAuthor = z.infer<typeof commentAuthor>;
export type CreateCommentRequest = z.infer<typeof createCommentRequest>;
export type Comment = z.infer<typeof comment>;
export type GetCommentsResponse = z.infer<typeof getCommentsResponse>;
export type DeleteCommentParams = z.infer<typeof deleteCommentParams>;
