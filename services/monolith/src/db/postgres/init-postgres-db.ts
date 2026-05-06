import { db } from '@/db/postgres';
import { normalizeError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { MessageOutboxStatus } from '@/modules/messages-outbox/messages-outbox.constants';

export async function initPostgresDB() {
	try {
		const query = `
			-- users table
			DROP TABLE IF EXISTS users CASCADE;
			CREATE TABLE users (
				id 				 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name 			 VARCHAR(255),
				email 		 VARCHAR(255) NOT NULL UNIQUE,
				avatar_url VARCHAR(255),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- posts table
			DROP TABLE IF EXISTS posts;
			CREATE TABLE posts (
				id 				 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id 	 UUID,
				content 	 TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_users_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
			);

			-- follows table
			DROP TABLE IF EXISTS follows;
			CREATE TABLE follows (
				id 					 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				follower_id  UUID NOT NULL,
				following_id UUID NOT NULL,
				created_at 	 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_follows_follower_id 
					FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT fk_follows_following_id 
					FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT unique_follower_following 
					UNIQUE (follower_id, following_id)
			);

			-- follower_partitions table
			DROP TABLE IF EXISTS follower_partitions;
			CREATE TABLE follower_partitions (
				id 							UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				follower_id 		UUID NOT NULL,
				partition_index INT NOT NULL,
				created_at 			TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				CONSTRAINT fk_follower_partitions_follower_id 
					FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
				CONSTRAINT unique_follower_partition 
					UNIQUE (follower_id)
			);

			-- messages_outbox table
			DROP TABLE IF EXISTS messages_outbox;
			CREATE TABLE messages_outbox (
				id 					UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				topic 			VARCHAR(255) NOT NULL,
				payload 		JSONB NOT NULL,
				status 			VARCHAR(20) NOT NULL DEFAULT '${MessageOutboxStatus.Pending}',
				sent_at 		TIMESTAMPTZ,
				retry_count INT NOT NULL DEFAULT 5,
				max_retries INT NOT NULL DEFAULT 0,
				created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`;
		await db.query(query);
	} catch (error) {
		logger.error({ err: normalizeError(error) }, 'Failed to init postgres db');
		throw error;
	}
}

export async function dropPostgresDB() {
	try {
		const query = `
			-- users table
			DROP TABLE IF EXISTS users CASCADE;
			-- posts table
			DROP TABLE IF EXISTS posts;
			-- follows table
			DROP TABLE IF EXISTS follows;
			-- follower_partitions table
			DROP TABLE IF EXISTS follower_partitions;
			-- messages_outbox table
			DROP TABLE IF EXISTS messages_outbox;
			DROP TYPE IF EXISTS messages_outbox_status;
		`;
		await db.query(query);
	} catch (error) {
		logger.error({ err: normalizeError(error) }, 'Failed to init postgres db');
		throw error;
	}
}
