## news-feed

Backend service for a “news feed” style system. Provides an HTTP API (Express) and uses Kafka for asynchronous processing, with Postgres and MongoDB.

#### Tech stack

**TypeScript**, **Express**, **Kafka**, **Postgres**, **MongoDB**

#### Prerequisites

**Node.js**, **Docker** (for Kafka/ZooKeeper/Postgres/Mongo via `docker-compose.yml`)

#### Local setup

Install dependencies: `npm install`

Start infrastructure: `docker compose up -d`

Environment variables for `.env`:

```bash
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

POSTGRES_DB_HOST=localhost
POSTGRES_DB_PORT=5432
POSTGRES_DB_USER=root_username
POSTGRES_DB_PASSWORD=root_secret_password
POSTGRES_DB_NAME=pg_news_feed__db
HOST_IP=127.0.0.1

MONGO_DB_HOST=localhost
MONGO_DB_PORT=27017
MONGO_DB_USER=root_username
MONGO_DB_PASSWORD=root_secret_password
MONGO_DB_NAME=mongo_news_feed_db

KAFKA_NEWS_FEED_SERVICE_CLIENT_ID=news-feed-service
KAFKA_BROKERS=127.0.0.1:9092
```

Run Postgres migrations: `npm run migrate:postgres`

Start the API in dev mode: `npm run dev`

#### Kafka / workers

- **create-post**: `npm run worker:create-post -- --followerId=<id>` — consumes create-post events and sends to followers
- **outbox**: `npm run worker:outbox` — relays pending outbox messages to Kafka
- **outbox-cleaner**: `npm run worker:outbox-cleaner` — cleans outbox data
- **delete-comments**: `npm run worker:delete-comments` — consumes delete-comments events and applies deletions

#### Migrations (Postgres)

- **migrate up**: `npm run migrate:postgres`
- **migrate down**: `npm run migrate:postgres:down`
- **create migration**: `npm run migrate:postgres:create -- <name>`
