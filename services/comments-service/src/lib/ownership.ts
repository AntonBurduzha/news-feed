import { NotFoundError } from '@/lib/errors';

export type OwnershipPolicy<TRow> = {
	resource: string;
	findById: (id: string) => Promise<TRow | null>;
	ownerOf: (row: TRow) => string;
};

export type OwnershipGuard<TRow> = (id: string, actorId: string) => Promise<TRow>;

export function createOwnershipGuard<TRow>(policy: OwnershipPolicy<TRow>): OwnershipGuard<TRow> {
	return async (id, actorId) => {
		const row = await policy.findById(id);
		if (!row || policy.ownerOf(row) !== actorId) {
			throw new NotFoundError(`${policy.resource} ${id} was not found`);
		}
		return row;
	};
}
