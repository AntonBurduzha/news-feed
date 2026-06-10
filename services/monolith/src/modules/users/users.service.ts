import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { withTransaction } from '@/db/postgres';
import { ValidationError } from '@/lib/errors';
import s3Service from '@/lib/s3';
import { NotFoundError } from '@/lib/errors';
// import { KafkaTopics } from '@/kafka/topics';
import { logger } from '@/lib/logger';
// import { requestContext } from '@/middleware/context';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import { postService } from '@/modules/posts/posts.service';
import { usersRepository } from './users.repository';
import type { CreateUserInput, UpdateUserInput, User, UserRow } from './users.types';
import type { PostsPort } from './users.ports';

function mapUser(row: UserRow): User {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		avatarUrl: row.avatar_url,
		createdAt: row.created_at,
	};
}

class UserService {
	private readonly userRepository;
	private readonly messagesOutboxRepository;
	private readonly postsPort: PostsPort;
	constructor(postsPort: PostsPort) {
		this.userRepository = usersRepository;
		this.messagesOutboxRepository = messagesOutboxRepository;
		this.postsPort = postsPort;
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

	async getUser(id: string): Promise<User> {
		const user = await this.userRepository.findById(id);
		if (!user) {
			throw new NotFoundError(`User ${id} was not found`);
		}
		return mapUser(user);
	}

	async updateUser(id: string, input: UpdateUserInput): Promise<User> {
		const updatedUser = await this.userRepository.update(id, input);
		if (!updatedUser) {
			throw new NotFoundError(`User ${id} was not found`);
		}
		return mapUser(updatedUser);
	}

	async deleteUser(id: string): Promise<void> {
		const posts = await this.postsPort.getPosts({ userId: id });
		const postIds = posts.posts.map(post => post.id);
		//const correlationId = requestContext.getStore()?.correlationId ?? '';
		// const message = {
		// 	topic: KafkaTopics.DeleteComments,
		// 	payload: {
		// 		key: id,
		// 		value: JSON.stringify({ postIds }),
		// 	},
		// 	correlationId,
		// };
		// TODO: send delete user message to Kafka to delete all posts and comments of user
		await withTransaction(async client => {
			const userIsDeleted = await this.userRepository.delete(id, client);
			if (!userIsDeleted) {
				throw new NotFoundError(`User ${id} was not found`);
			}
			if (postIds.length > 0) {
				//await this.messagesOutboxRepository.create(message, client);
				logger.info({ postIds }, 'Posts deleted message fanned out via Kafka');
			}
		});
	}

	async uploadAvatar(id: string, input: Buffer): Promise<string> {
		const user = await this.userRepository.findById(id);
		if (!user) {
			throw new NotFoundError(`User ${id} was not found`);
		}

		let buffer: Buffer;
		try {
			buffer = await sharp(input, { limitInputPixels: 25_000_000 })
				.rotate()
				.resize(256, 256, { fit: 'cover', position: 'attention' })
				.webp({ quality: 82 })
				.toBuffer();
		} catch {
			throw new ValidationError('File is not a valid image');
		}
		const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
		const key = `avatars/${id}/${hash}.webp`;
		const avatarUrl = await s3Service.putObject({ key, body: buffer, contentType: 'image/webp' });
		await this.userRepository.updateAvatar(id, avatarUrl);
		// TODO: Send to Kafka to remove old avatar from S3
		if (user.avatar_url) {
			try {
				const previousKey = new URL(user.avatar_url).pathname.slice(1);
				await s3Service.deleteObject(previousKey);
			} catch {
				logger.error({ avatarUrl: user.avatar_url }, 'Failed to delete previous avatar');
			}
		}
		return avatarUrl;
	}
}

const postsPort: PostsPort = {
	getPosts: ({ userId }) => postService.getPosts({ userId }),
};
export const userService = new UserService(postsPort);
