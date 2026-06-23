import {
	type LoginRequest,
	type RegisterRequest,
	type RefreshRequest,
} from '@/modules/auth/auth.schemas';

const newUserInput: RegisterRequest = { body: { email: 'a@b.com', password: 'password' } };
const invalidNewUserInput: RegisterRequest = { body: { email: 'a@b.com', password: 'pass' } };
const newUserResult = { accessToken: 'access.jwt', refreshToken: 'r', userId: 'user-1' };

const loginInput: LoginRequest = { body: { email: 'a@b.com', password: 'password' } };
const invalidLoginInput: LoginRequest = { body: { email: 'a@b.com', password: '' } };
const loginResult = { accessToken: 'access.jwt', refreshToken: 'r' };

const refreshInput: RefreshRequest = { body: { refreshToken: 'r' } };
const invalidRefreshInput: RefreshRequest = { body: { refreshToken: '' } };
const refreshResult = { accessToken: 'access.jwt' };

const refreshTokenData = { raw: 'r', tokenHash: 'h', expiresAt: new Date() };
const user = { user_id: 'user-1' };
const hashedPassword = 'hashed_password';
const accessToken = 'access.jwt';
const credentials = { email: 'a@b.com', password: 'password' };

export const authFixtures = {
	newUserInput,
	invalidNewUserInput,
	newUserResult,
	//
	loginInput,
	invalidLoginInput,
	loginResult,
	//
	refreshInput,
	invalidRefreshInput,
	refreshResult,
	//
	refreshTokenData,
	user,
	hashedPassword,
	accessToken,
	credentials,
};
