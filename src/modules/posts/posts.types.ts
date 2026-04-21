export type GetPostsQueryParams = {
	cursor?: string;
	limit?: number;
	userId: number;
};

export type Post = {
	id: number;
	userId: number;
	content: string;
	createdAt: string;
	updatedAt: string;
};

export type PostRow = {
	id: number;
	user_id: number;
	content: string;
	created_at: Date;
	updated_at: Date;
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
