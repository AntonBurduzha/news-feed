import type { LoginRequest, RegisterRequest, RefreshRequest } from './auth.schemas';

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
	password_hash: string;
	avatar_url: string;
	created_at: string;
};

export type RefreshToken = {
	id: string;
	user_id: string;
	tokenHash: string;
	expiresAt: string;
	revokedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type RefreshTokenRow = {
	id: string;
	user_id: string;
	token_hash: string;
	expires_at: Date;
	revoked_at: Date | null;
	created_at: Date;
	updated_at: Date;
};

export type CreateRefreshTokenInput = {
	userId: string;
	tokenHash: string;
	expiresAt: Date;
};

export { LoginRequest, RegisterRequest, RefreshRequest };
