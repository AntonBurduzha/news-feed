export type User = {
	id: string;
	name: string;
	email: string;
	avatarUrl: string;
	createdAt: string;
};

export type UserRow = {
	id: string;
	name: string;
	email: string;
	avatar_url: string;
	created_at: string;
};

export type CreateUserInput = {
	email: string;
};

export type UpdateUserInput = {
	name: string;
	email: string;
	avatarUrl: string;
};
