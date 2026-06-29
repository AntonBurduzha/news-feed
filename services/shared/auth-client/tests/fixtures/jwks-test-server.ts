import { createServer, type Server } from 'node:http';
import type { TestKeyPair } from '../fixtures/sign-token.js';
import { buildJwks } from '../fixtures/sign-token.js';

export type JwksServer = {
	url: string;
	close: () => Promise<void>;
};

export async function startJwksTestServer(keys: TestKeyPair): Promise<JwksServer> {
	const jwks = await buildJwks(keys.publicKey, keys.kid);

	const server: Server = createServer((req, res) => {
		if (req.url === '/.well-known/jwks.json' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(jwks));
			return;
		}
		res.writeHead(404);
		res.end();
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Failed to bind JWKS server');
	}

	const url = `http://127.0.0.1:${address.port}/.well-known/jwks.json`;

	return {
		url,
		close: () =>
			new Promise((resolve, reject) => {
				server.close(err => (err ? reject(err) : resolve()));
			}),
	};
}
