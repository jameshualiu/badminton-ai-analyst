# Stage 1: Build Stage
# Use Node to install dependencies and build the React app.
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first for better caching.
COPY package*.json ./
RUN npm install

# Copy source code and build.
COPY . .
RUN npm run build

# Stage 2: Production Stage
# Use Nginx to serve only the final, static files.
FROM nginx:stable-alpine

# Copy the built files from the build stage to Nginx's HTML folder.
COPY --from=build /app/dist /usr/share/nginx/html

# Expose Port 80 for Nginx.
EXPOSE 80

# The default command for Nginx is already fine for production.
CMD ["nginx", "-g", "daemon off;"]
