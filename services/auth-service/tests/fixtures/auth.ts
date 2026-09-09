import {
	type LoginRequest,
	type RegisterRequest,
	type RefreshRequest,
} from '@/modules/auth/auth.schemas';
import type { RefreshTokenRow } from '@/modules/auth/auth.types';

const newUserInput: RegisterRequest = { body: { email: 'a@b.com', password: 'password' } };

const loginInput: LoginRequest = { body: { email: 'a@b.com', password: 'password' } };

const refreshInput: RefreshRequest = { body: { refreshToken: 'r' } };

const refreshTokenData = { raw: 'r', tokenHash: 'h', expiresAt: new Date() };
const rotatedRefreshTokenData = { raw: 'r2', tokenHash: 'h2', expiresAt: new Date() };
const familyId = 'family-1';
const user = { user_id: 'user-1' };
const hashedPassword = 'hashed_password';
const accessToken = 'access.jwt';
const credentials = { email: 'a@b.com', password: 'password' };

function makeRefreshTokenRow(overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow {
	return {
		id: 'refresh-token-1',
		user_id: user.user_id,
		token_hash: refreshTokenData.tokenHash,
		family_id: familyId,
		used_at: null,
		expires_at: new Date(Date.now() + 60_000),
		revoked_at: null,
		created_at: new Date(),
		updated_at: new Date(),
		...overrides,
	};
}

export const authFixtures = {
	newUserInput,
	loginInput,
	refreshInput,
	//
	refreshTokenData,
	rotatedRefreshTokenData,
	familyId,
	makeRefreshTokenRow,
	user,
	hashedPassword,
	accessToken,
	credentials,
};
