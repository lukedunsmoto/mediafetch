FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Now copy the rest of the project (THIS is the important bit)
COPY . .

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "server.js"]
