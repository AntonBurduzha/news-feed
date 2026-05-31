import mongoose from 'mongoose';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { mongoPoolConnections } from '@/lib/metrics';

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

export const startMongoPoolMetrics = () => {
	const client = mongoose.connection.getClient();
	let ready = 0;
	let checkedOut = 0;
	let waiting = 0;
	client.on('connectionReady', () => {
		ready++;
	});
	client.on('connectionClosed', () => {
		ready = Math.max(0, ready - 1);
	});
	client.on('connectionCheckedOut', () => {
		checkedOut++;
		waiting = Math.max(0, waiting - 1);
	});
	client.on('connectionCheckedIn', () => {
		checkedOut = Math.max(0, checkedOut - 1);
	});
	client.on('connectionCheckOutStarted', () => {
		waiting++;
	});
	client.on('connectionCheckOutFailed', () => {
		waiting = Math.max(0, waiting - 1);
	});
	setInterval(() => {
		mongoPoolConnections.set({ state: 'active', service: env.SERVICE_NAME }, checkedOut);
		mongoPoolConnections.set(
			{ state: 'idle', service: env.SERVICE_NAME },
			Math.max(0, ready - checkedOut),
		);
		mongoPoolConnections.set({ state: 'waiting', service: env.SERVICE_NAME }, waiting);
	}, 15_000).unref();
};
