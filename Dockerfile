# Base image bundles Chromium + all system libs for Playwright 1.60.0,
# matching the version pinned in package.json. No manual apt list to drift.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install deps (incl. devDeps — needed for `next build`) against the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# env.ts validation is lazy (runtime-only), but guard the build with throwaway
# values in case any route is statically evaluated. These do NOT persist to the
# image — they exist only for this RUN. Real values come from the host at runtime.
RUN GITHUB_CLIENT_ID=build \
    GITHUB_CLIENT_SECRET=build \
    SESSION_SECRET=build_only_placeholder_secret_0000000000 \
    MCP_TOKEN_SECRET=build_only_placeholder_secret_0000000000 \
    APP_URL=http://localhost:3000 \
    npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
