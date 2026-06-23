import { stopPostgres } from './pg-setup';

export default async function setup() {
	return async () => {
		await stopPostgres();
	};
}
