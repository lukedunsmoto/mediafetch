FROM node:20-alpine

WORKDIR /app

# Runtime deps:
# - yt-dlp: downloader
# - ffmpeg: merge mp4 / extract mp3
RUN apk add --no-cache yt-dlp ffmpeg

# App deps
COPY package*.json ./
RUN npm install --omit=dev

# App files
COPY . .

ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "server.js"]




