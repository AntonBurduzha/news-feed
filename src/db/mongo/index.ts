import mongoose from 'mongoose';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

const uri = `mongodb://${env.MONGO_DB_USER}:${env.MONGO_DB_PASSWORD}@${env.MONGO_DB_HOST}:${env.MONGO_DB_PORT}/${env.MONGO_DB_NAME}?authSource=admin`;

mongoose.connection.on('connected', () => {
	logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', err => {
	logger.error({ err }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
	logger.warn('Mongoose disconnected from MongoDB');
});

export async function connectMongo(): Promise<void> {
	await mongoose.connect(uri, {
		maxPoolSize: env.isProduction ? 50 : 10,
		connectTimeoutMS: 5_000,
		serverSelectionTimeoutMS: 5_000,
	});
	logger.info('MongoDB connection verified on url: ' + uri);
}

export async function disconnectMongo(): Promise<void> {
	await mongoose.disconnect();
	logger.info('MongoDB connection closed');
}
