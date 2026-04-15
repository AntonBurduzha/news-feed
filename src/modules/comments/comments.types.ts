export type CommentAuthor = {
	userId: number;
	name: string;
	avatarUrl: string | null;
};

export type Comment = {
	id: string;
	postId: number;
	author: CommentAuthor;
	content: string;
	createdAt: string;
};

export type CreateCommentInput = {
	postId: number;
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

export type DeleteCommentsInput = {
	postIds: number[];
};
