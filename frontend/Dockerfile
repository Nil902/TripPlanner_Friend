# Frontend React + Vite Dockerfile
FROM node:22-alpine AS build

WORKDIR /app

# Copy shared package for TypeScript type references
COPY packages/shared /app/packages/shared
COPY packages/shared /packages/shared

# Install dependencies
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

# Build production bundle
COPY frontend/ ./
RUN npm run build

# Production Static Server
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
