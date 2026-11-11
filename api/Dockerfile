# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
# The "prepare" script installs husky and assumes the repo layout
# (`cd .. && api/node_modules/.bin/husky`), which does not exist in the image.
RUN pnpm pkg delete scripts.prepare \
  && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
  PORT=10000
COPY package.json pnpm-lock.yaml ./
RUN pnpm pkg delete scripts.prepare \
  && pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY instrumentation.mjs ./
# The local storage driver (STORAGE_DRIVER=local) creates and pings ./storage.
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 10000
CMD ["pnpm", "start:prod"]
