# 1. BASE IMAGE: Use 'alpine' for a tiny, secure footprint (~50MB vs ~900MB).
FROM node:20-alpine

# 2. WORKDIR: Create a specific folder for your app inside the "box".
WORKDIR /usr/src/app

# 3. LAYER CACHING: Copy package files first and run 'npm install' BEFORE copying code.
# This makes subsequent builds extremely fast if only code changes.
COPY package*.json ./

# 4. INSTALL: For development in Docker, we want both production and dev dependencies.
RUN npm install

# 5. SOURCE CODE: Copy the rest of your backend files into the box.
COPY . .

# 6. SECURITY: Never run as "root" (Admin) in production.
# Node images come with a built-in 'node' user for safety.
USER node

# 7. PORT: Document that your Express server lives on port 3000.
EXPOSE 3000

# 8. START: The default command to launch your server.
CMD ["node", "server.js"]
