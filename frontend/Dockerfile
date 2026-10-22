# Builds the React app and serves it with nginx, proxying /api to the `api` service.
FROM node:22-alpine AS build
WORKDIR /app
# package.json pins Yarn 4 (and yarn.lock is in its format); the image's Yarn 1 can't read
# that lockfile and re-resolves everything. Corepack provides the pinned version.
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
# Skip Electron's ~100 MB binary (dev dependency for the desktop app; not needed for the web build).
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable
COPY . .
# Empty address = call the API on the same host/port that serves the page.
RUN VITE_API_ADDR= yarn build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080
