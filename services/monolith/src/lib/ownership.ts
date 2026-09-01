import { NotFoundError } from '@/lib/errors';

export type OwnershipPolicy<TRow> = {
	/** Resource name used in the not-found message, e.g. 'Post'. */
	resource: string;
	/** Loads a row by primary key; must resolve to null when the row is absent. */
	findById: (id: string) => Promise<TRow | null>;
	/** Extracts the id of the user who owns the row. */
	ownerOf: (row: TRow) => string;
};

export type OwnershipGuard<TRow> = (id: string, actorId: string) => Promise<TRow>;

/**
 * Builds an ownership assertion for a resource.
 *
 * Returns the loaded row so callers can reuse it (e.g. to build an outbox
 * payload) without issuing a second query.
 *
 * A row owned by somebody else is reported as NotFoundError (404), never 403:
 * a 403 would confirm to an attacker that the id exists.
 *
 * Lives in the service layer rather than in middleware because services are
 * also driven by Kafka consumers and /internal routes, where there is no
 * request to guard.
 */
export function createOwnershipGuard<TRow>(policy: OwnershipPolicy<TRow>): OwnershipGuard<TRow> {
	return async (id, actorId) => {
		const row = await policy.findById(id);
		if (!row || policy.ownerOf(row) !== actorId) {
			throw new NotFoundError(`${policy.resource} ${id} was not found`);
		}
		return row;
	};
}
