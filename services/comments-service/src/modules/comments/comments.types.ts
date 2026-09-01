import type { CommentAuthor, CommentAuthorProfile, Comment } from './comments.schemas';

export type CreateCommentInput = {
	postId: string;
	author: CommentAuthor;
	content: string;
};

export type GetCommentsInput = {
	limit?: number;
	cursor?: string;
};

export type GetCommentsResult = {
	comments: Comment[];
	nextCursor: string | null;
};

export type { CommentAuthor, CommentAuthorProfile, Comment };
