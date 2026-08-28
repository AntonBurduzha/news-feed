export type Post = {
	id: string;
	userId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
};

export type PostRow = {
	id: string;
	user_id: string;
	content: string;
	created_at: string;
	updated_at: string;
};

export type GetPostsResult = {
	posts: Post[];
	nextCursor: string | null;
};

export type UpdatePostInput = {
	content: string;
};

export type CursorParams = {
	createdAt: string | null;
	id: string | null;
};
