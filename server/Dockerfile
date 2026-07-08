# TestMate API — Cloud Run container
FROM node:22-slim

ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); the app reads process.env.PORT.
ENV PORT=8080

WORKDIR /app

# Install production deps only, using the lockfile for reproducible builds.
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY . .

EXPOSE 8080
# tsx (a production dependency) executes the mixed .js/.ts source tree directly.
CMD ["npx", "tsx", "server.js"]
