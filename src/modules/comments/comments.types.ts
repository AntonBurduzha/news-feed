export type CommentAuthor = {
	userId: string;
	name: string;
	avatarUrl: string | null;
};

export type Comment = {
	id: string;
	postId: string;
	author: CommentAuthor;
	content: string;
	createdAt: string;
};

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

export type DeleteCommentsInput = {
	postIds: string[];
};
