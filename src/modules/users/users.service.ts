import { withTransaction } from '@/db/postgres';
import { NotFoundError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
import { logger } from '@/lib/logger';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import { postService } from '@/modules/posts/posts.service';
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
	private readonly messagesOutboxRepository;
	private readonly postService;
	constructor() {
		this.userRepository = usersRepository;
		this.messagesOutboxRepository = messagesOutboxRepository;
		this.postService = postService;
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
		await withTransaction(async client => {
			const userIsDeleted = await this.userRepository.delete(id, client);
			if (!userIsDeleted) {
				throw new NotFoundError(`User ${id} was not found`);
			}
			const posts = await this.postService.getPosts({ userId: id });
			const postIds = posts.posts.map(post => post.id);
			const message = {
				topic: KafkaTopics.DeleteComments,
				payload: {
					key: String(id),
					value: JSON.stringify({ postIds }),
				},
			};
			await this.messagesOutboxRepository.create(message, client);
			logger.info({ postIds }, 'Posts deleted message fanned out via Kafka');
		});
	}
}

export const userService = new UserService();
