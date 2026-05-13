FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/monolith/package.json services/monolith/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/comments-service/package.json services/comments-service/package.json
COPY services/shared/contracts/package.json services/shared/contracts/package.json

RUN npm ci

FROM node:22-alpine AS app

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY tsconfig.base.json ./
COPY services/auth-service/ services/auth-service/
COPY services/shared/contracts/ services/shared/contracts/

WORKDIR /app/services/auth-service

EXPOSE 3002

CMD ["npx", "tsx", "src/index.ts"]