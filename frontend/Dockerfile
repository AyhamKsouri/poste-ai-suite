# Dev-oriented image: runs the Vite dev server (hot reload), not a production
# nginx/static build - matches today's `npm run dev` workflow, containerized.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Source is bind-mounted over this in docker-compose.yml for live reload;
# copied here too so `docker build` alone still produces a runnable image.
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
