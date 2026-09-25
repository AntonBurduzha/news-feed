\set ON_ERROR_STOP on

\getenv pw POSTGRES_REPLICATION_PASSWORD
\if :{?pw}
\else
\warn 'POSTGRES_REPLICATION_PASSWORD is not set - add it to .env'
\quit
\endif

SELECT format('CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicator')
\gexec

SELECT format('ALTER ROLE replicator WITH REPLICATION LOGIN PASSWORD %L', :'pw')
\gexec

SELECT pg_create_physical_replication_slot('replica_1')
WHERE NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'replica_1');
