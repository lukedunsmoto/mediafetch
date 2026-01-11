# MediaFetch

<div align="center">

![MediaFetch Logo](https://www.lukedunsmore.com/wp-content/uploads/2026/01/MediaFetch-Logo.svg)

[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9C%93-brightgreen?style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A tiny, self-hosted web wrapper for **yt-dlp**.

</div>

---

## Features

- **Zero Database**  
  No state, no queues, just files on disk.

- **Optional Security**  
  HTTP Basic Auth (browser-native).  
  If credentials are set, the UI, API, and downloads are protected.

- **Modern UI**  
  Simple dashboard with real-time terminal logs (SSE).

- **Flexible Formats**  
  - Best video + audio → **MP4**
  - Audio-only extraction → **MP3**

- **Batteries Included**  
  Docker image bundles **yt-dlp** and **ffmpeg** — no host installs required.

---

## Environment Variables

| Variable | Description |
|-------|------------|
| `PORT` | Port to run on (default: `3002`) |
| `BASIC_AUTH_USER` | Username for Basic Auth (optional) |
| `BASIC_AUTH_PASS` | Password for Basic Auth (optional) |
| `OUTPUT_DIR` | Download directory (default: `/data/downloads`) |
| `PUBLIC_BASE_URL` | Public domain (e.g. `https://mediafetch.example.com`) **Required** to generate download links |

> **Note**  
> If `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` are **not set**, authentication is disabled (useful for local dev).

---

## Quick Start

```bash
git clone https://github.com/lukedunsmoto/mediafetch.git
cd mediafetch
cp .env.example .env
docker compose up -d --build
```

Then open your browser at:

```
http://localhost:3002
```

---

## Deployment (Docker)

- Mount a volume to `/data/downloads` to persist files
- Set `PUBLIC_BASE_URL` to your real domain when running behind a proxy
- Works cleanly with Traefik, Dokploy, Coolify, or raw Docker

---

## API

### `POST /api/fetch`
Starts a download job and streams logs via **Server-Sent Events (SSE)**.

**Body**
```json
{
  "url": "https://example.com/video",
  "mode": "video | audio",
  "filename": "optional-custom-name"
}
```

### `GET /api/health`
Simple health check.

---

## Philosophy

MediaFetch is intentionally tiny:

- No accounts
- No database
- No background workers
- No dashboards that fight you

Just a thin, inspectable wrapper around a powerful tool.

---

## License

MIT License

---

## Credits

Built with:
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- ffmpeg

---

Happy fetching.

