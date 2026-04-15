import { NotFoundError } from '@/lib/errors';
import { usersRepository } from './users.repository';
import type { CreateUserInput, UpdateUserInput, User, UserRow } from './users.types';

function mapUser(row: UserRow): User {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		avatarUrl: row.avatar_url,
		createdAt: row.created_at.toISOString(),
	};
}

class UserService {
	private readonly userRepository;

	constructor() {
		this.userRepository = usersRepository;
	}

	async createUser(input: CreateUserInput): Promise<User> {
		const user = await this.userRepository.create(input);
		if (!user) {
			throw new Error('Database did not return the created user');
		}
		return mapUser(user);
	}

	async getUsers(): Promise<User[]> {
		const users = await this.userRepository.findAll();
		return users.map(mapUser);
	}

	async getUser(id: number): Promise<User> {
		const user = await this.userRepository.findById(id);
		if (!user) {
			throw new NotFoundError(`User ${id} was not found`);
		}
		return mapUser(user);
	}

	async updateUser(id: number, input: UpdateUserInput): Promise<User> {
		const updatedUser = await this.userRepository.update(id, input);
		if (!updatedUser) {
			throw new NotFoundError(`User ${id} was not found`);
		}
		return mapUser(updatedUser);
	}

	async deleteUser(id: number): Promise<void> {
		const deleted = await this.userRepository.delete(id);
		if (!deleted) {
			throw new NotFoundError(`User ${id} was not found`);
		}
	}
}

export const userService = new UserService();
