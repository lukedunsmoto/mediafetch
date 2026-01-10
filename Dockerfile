FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for downloads/merging
# - python3 + py3-pip: to install yt-dlp
# - ffmpeg: required for mp3 extraction and mp4 merging
RUN apk add --no-cache python3 py3-pip ffmpeg \
  && pip3 install --no-cache-dir -U yt-dlp

# Install app deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app (public/, assets/, server.js, etc)
COPY . .

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "server.js"]


