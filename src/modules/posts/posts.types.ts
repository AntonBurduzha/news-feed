export type GetPostsQueryParams = {
	cursor?: string;
	limit?: number;
	userId: number;
};

export type Post = {
	id: number;
	userId: number;
	content: string;
	likesCount: number;
	commentsCount: number;
	createdAt: string;
};

export type PostRow = {
	id: number;
	user_id: number;
	content: string;
	likes_count: number;
	comments_count: number;
	created_at: Date;
};

export type GetPostsResult = {
	posts: Post[];
	nextCursor: string | null;
};

export type CreatePostInput = {
	userId: number;
	content: string;
};

export type UpdatePostInput = {
	content: string;
};
