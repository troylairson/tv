# syntax=docker/dockerfile:1
# JS output is architecture-independent: build it once on the native platform, not under emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/schedule/package.json packages/schedule/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
RUN pnpm -r test && pnpm -r build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8420 DATA_DIR=/data WEB_DIR=/app/web
# ffmpeg/ffprobe check and remux the commercials pulled from the Internet Archive.
RUN apk add --no-cache ffmpeg
# server.js is a single bundle (esbuild), so the runtime image needs no node_modules.
COPY --from=build /src/packages/server/dist/server.js ./server.js
COPY --from=build /src/packages/web/dist ./web
VOLUME /data
EXPOSE 8420
CMD ["node", "server.js"]
