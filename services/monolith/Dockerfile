FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false


FROM base AS deps
COPY package.json package-lock.json ./
COPY services/monolith/package.json           services/monolith/package.json
COPY services/auth-service/package.json       services/auth-service/package.json
COPY services/comments-service/package.json   services/comments-service/package.json
COPY services/fan-out-service/package.json    services/fan-out-service/package.json
COPY services/shared/contracts/package.json   services/shared/contracts/package.json
COPY services/shared/auth-client/package.json services/shared/auth-client/package.json
COPY services/shared/runtime/package.json     services/shared/runtime/package.json
RUN --mount=type=cache,target=/root/.npm npm ci


FROM deps AS build
COPY tsconfig.base.json ./
COPY services/shared/contracts/   services/shared/contracts/
COPY services/shared/runtime/     services/shared/runtime/
COPY services/shared/auth-client/ services/shared/auth-client/
COPY services/monolith/           services/monolith/
RUN npm run build --workspace services/shared/contracts \
 && npm run build --workspace services/shared/runtime \
 && npm run build --workspace services/shared/auth-client \
 && npm run build --workspace services/monolith


FROM build AS migrate
WORKDIR /app/services/monolith
CMD ["npx", "node-pg-migrate", "up", \
     "-m", "./dist/src/db/postgres/migrations", \
     "--ignore-pattern", ".*\\.(d\\.ts|js\\.map)"]

FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY services/monolith/package.json           services/monolith/package.json
COPY services/auth-service/package.json       services/auth-service/package.json
COPY services/comments-service/package.json   services/comments-service/package.json
COPY services/fan-out-service/package.json    services/fan-out-service/package.json
COPY services/shared/contracts/package.json   services/shared/contracts/package.json
COPY services/shared/auth-client/package.json services/shared/auth-client/package.json
COPY services/shared/runtime/package.json     services/shared/runtime/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/services/shared/contracts/package.json   services/shared/contracts/package.json
COPY --from=build /app/services/shared/contracts/dist           services/shared/contracts/dist
COPY --from=build /app/services/shared/runtime/package.json     services/shared/runtime/package.json
COPY --from=build /app/services/shared/runtime/dist             services/shared/runtime/dist
COPY --from=build /app/services/shared/auth-client/package.json services/shared/auth-client/package.json
COPY --from=build /app/services/shared/auth-client/dist         services/shared/auth-client/dist
COPY --from=build /app/services/monolith/package.json 					services/monolith/package.json
COPY --from=build /app/services/monolith/dist/src     					services/monolith/dist/src
COPY --from=build /app/services/monolith/dist/workers 					services/monolith/dist/workers

USER node
WORKDIR /app/services/monolith
EXPOSE 3000
CMD ["node", "--import", "./dist/src/lib/tracing.js", "dist/src/index.js"]
