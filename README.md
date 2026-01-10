# MediaFetch

A tiny, self-hosted web wrapper for `yt-dlp`. 

## Features
- **Zero Database:** No state, no queues, just files.
- **Secure:** HTTP Basic Auth (browser-native) protects the interface.
- **Modern UI:** Dark mode dashboard with real-time terminal logs.
- **Formats:** Auto-merges best video+audio (mp4) or extracts audio (mp3).

## Environment Variables
- `PORT` (default `3002`)
- `BASIC_AUTH_USER` (default `admin`)
- `BASIC_AUTH_PASS` (default `changeme`)
- `OUTPUT_DIR` (default `/data/downloads`)
- `PUBLIC_BASE_URL` (e.g. `https://your-domain.com`) - **Required** to generate download links.

## Quick Start

1. Clone the repo
2. Rename `.env.example` to `.env` and update your password/other variables.
3. Run with Docker Compose:

```bash
docker compose up -d --build
```

## Deployment (Docker)
1. Mount a volume to `/data/downloads` to persist files.
2. Set `PUBLIC_BASE_URL` to your actual domain.

3. Access via browser; login with your Basic Auth credentials.
