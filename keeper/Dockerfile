# Always-on keeper for any container host (Fly.io, Railway, a VPS). Build from the
# repository root so the shared deployment addresses are included:
#   docker build -f keeper/Dockerfile -t microtrove-keeper .
#   docker run --env-file keeper/.env microtrove-keeper
FROM node:22-alpine
WORKDIR /app
COPY keeper/package.json keeper/package-lock.json keeper/
RUN cd keeper && npm ci --omit=dev
COPY deployments deployments
COPY keeper/src keeper/src
WORKDIR /app/keeper
ENV STATE_FILE=/tmp/keeper-state.json
CMD ["node", "src/index.ts"]
