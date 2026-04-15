export type User = {
	id: number;
	name: string;
	email: string;
	avatarUrl: string;
	createdAt: string;
};

export type UserRow = {
	id: number;
	name: string;
	email: string;
	avatar_url: string;
	created_at: Date;
};

export type CreateUserInput = {
	email: string;
};

export type UpdateUserInput = {
	name: string;
	email: string;
	avatarUrl: string;
};
