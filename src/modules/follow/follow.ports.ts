import type { User } from '@/modules/users/users.types';

export interface UsersPort {
	getUser(id: string): Promise<User>;
}
