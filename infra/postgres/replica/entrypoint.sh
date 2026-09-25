#!/usr/bin/env bash
set -euo pipefail # exit on error

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${PRIMARY_HOST:-postgres}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_SLOT="${REPLICATION_SLOT:-replica_1}"

if [ -s "$PGDATA/PG_VERSION" ]; then # if the data directory is already initialised
	echo "replica $PGDATA already initialised — skipping pg_basebackup"
else
	echo "replica empty data directory — seeding from $PRIMARY_HOST:$PRIMARY_PORT"

	mkdir -p "$PGDATA"
	# set the owner and permissions of the data directory
	chown postgres:postgres "$PGDATA"
	chmod 700 "$PGDATA"

	until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -q; do
		echo "replica waiting for primary"
		sleep 2
	done

	# -R writes primary_conninfo + primary_slot_name into postgresql.auto.conf and creates the empty standby.signal file
	# -Xs streams WAL during the backup so the copy is self-consistent
	# -S consumes the slot the primary already created
	gosu postgres pg_basebackup -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER" \
		-D "$PGDATA" -Fp -Xs -P -R -S "$REPLICATION_SLOT"
	echo "replica seeded. Recoveru settings:"
	grep -E 'primary_conninfo|primary_slot_name' "$PGDATA/postgresql.auto.conf" || true
fi

# pass on the arguments to the stock image entrypoint
exec docker-entrypoint.sh "$@" 
