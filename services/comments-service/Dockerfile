FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/monolith/package.json services/monolith/package.json
COPY services/comments-service/package.json services/comments-service/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/shared/contracts/package.json services/shared/contracts/package.json
COPY services/shared/auth-client/package.json services/shared/auth-client/package.json

RUN npm ci

FROM node:22-alpine AS app

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY tsconfig.base.json ./
COPY services/comments-service/ services/comments-service/
COPY services/shared/contracts/ services/shared/contracts/
COPY services/shared/auth-client/ services/shared/auth-client/

WORKDIR /app/services/comments-service

EXPOSE 3001

CMD ["npx", "tsx", "--import", "./src/lib/tracing.ts", "src/index.ts"]