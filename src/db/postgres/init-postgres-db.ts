import { db } from '@/db/postgres';
import { normalizeError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function initPostgresDB() {
	try {
		const query = `
			-- users table
			DROP TABLE IF EXISTS users CASCADE;
			CREATE TABLE users (
				id 				 SERIAL PRIMARY KEY,
				name 			 VARCHAR(255),
				email 		 VARCHAR(255) NOT NULL UNIQUE,
				avatar_url VARCHAR(255),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- posts table
			DROP TABLE IF EXISTS posts;
			CREATE TABLE posts (
				id 				 SERIAL PRIMARY KEY,
				user_id 	 INT,
				content 	 TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_users_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
			);
			CREATE INDEX idx_posts_user_id_created_at_id ON posts (user_id, created_at DESC, id DESC);

			-- follows table
			DROP TABLE IF EXISTS follows;
			CREATE TABLE follows (
				id 					 SERIAL PRIMARY KEY,
				follower_id  INT,
				following_id INT,
				created_at 	 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_follows_follower_id 
					FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT fk_follows_following_id 
					FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT unique_follower_following 
					UNIQUE (follower_id, following_id)
			);
			CREATE INDEX idx_follows_follower_id ON follows (follower_id);
			CREATE INDEX idx_follows_following_id ON follows (following_id);

			-- follower_partitions table
			DROP TABLE IF EXISTS follower_partitions;
			CREATE TABLE follower_partitions (
				id 							SERIAL PRIMARY KEY,
				follower_id 		INT NOT NULL,
				partition_index INT NOT NULL,
				created_at 			TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_follower_partitions_follower_id 
					FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT unique_follower_partition 
					UNIQUE (follower_id)
			);
			CREATE INDEX idx_follower_partitions_follower_id ON follower_partitions (follower_id);

			-- messages_outbox table
			DROP TABLE IF EXISTS messages_outbox;
			DROP TYPE IF EXISTS messages_outbox_status;
			CREATE TYPE messages_outbox_status AS ENUM ('pending', 'sent', 'failed');
			CREATE TABLE messages_outbox (
				id 					SERIAL PRIMARY KEY,
				topic 			VARCHAR(255) NOT NULL,
				payload 		JSONB NOT NULL,
				status 			messages_outbox_status DEFAULT 'pending',
				sent_at 		TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				retry_count INT NOT NULL DEFAULT 5,
				max_retries INT NOT NULL DEFAULT 0,
				created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX idx_messages_outbox_pending ON messages_outbox (status) WHERE status = 'pending';
		`;
		await db.query(query);
	} catch (error) {
		logger.error({ err: normalizeError(error) }, 'Failed to init postgres db');
		throw error;
	}
}
