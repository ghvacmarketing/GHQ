# ghvac-tools production image.
# Node 20 + poppler-utils (pdftoppm, for salesbook page rendering) + Chromium
# (via Playwright, for salesbook PDF export). Single stage for reliability.
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
# Keep Playwright's browser download in a stable, root-owned location that the
# runtime (also root) resolves by default.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# System tools: poppler-utils provides `pdftoppm`, used to rasterize the
# salesbook source PDF into page images on first boot.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install node dependencies. --include=dev is required because NODE_ENV=production
# would otherwise make npm skip devDependencies (Vite/esbuild) needed by the build.
COPY package*.json ./
RUN npm ci --include=dev

# Install Chromium matching the installed playwright-core version, plus the
# system libraries it needs. --with-deps runs apt for the shared libs.
RUN PW_VERSION="$(node -p "require('playwright-core/package.json').version")" \
 && npx --yes "playwright@${PW_VERSION}" install --with-deps chromium

# App source + production build (client -> dist/public, server -> dist/index.js).
COPY . .
RUN npm run build

# Render injects PORT; the server reads process.env.PORT (defaults to 5000).
EXPOSE 5000
CMD ["npm", "start"]
