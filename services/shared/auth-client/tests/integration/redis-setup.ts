import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

let container: StartedRedisContainer;

export async function startRedis(): Promise<string> {
	container = await new RedisContainer('redis:7-alpine').start();
	return container.getConnectionUrl();
}

export async function stopRedis(): Promise<void> {
	await container?.stop();
}
