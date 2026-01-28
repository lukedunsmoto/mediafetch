# MediaFetch

<div align="center">

![MediaFetch Logo](https://www.lukedunsmore.com/wp-content/uploads/2026/01/MediaFetch-Logo.svg)

[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9C%93-brightgreen?style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A tiny, self-hosted web wrapper for **yt-dlp**.

</div>

---

<div align="center">

[![MediaFetch Demo](https://www.lukedunsmore.com/wp-content/uploads/2026/01/Screenshot-2026-01-10-200029.png)](https://www.lukedunsmore.com/wp-content/uploads/2026/01/Recording-2026-01-10-180150.mp4)

*Click the image above to watch the demo video.*

</div>

## Features

- **Universal Support**
  Works with YouTube, Twitch, Vimeo, SoundCloud, and ![thousands of other sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

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

- **Always Fresh**
  Docker build automatically pulls the latest official yt-dlp binary, ensuring support for the newest sites and bypassing recent YouTube blocks.

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
# Builds the image and fetches the latest yt-dlp binary
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

## Advanced: Fixing 403 & Unsupported Errors

If you encounter `HTTP Error 403: Forbidden` (common on YouTube) or need to download from premium sites that require a login, you can pass your browser cookies to MediaFetch.

**1. Get your cookies**
   - Install a "Get cookies.txt LOCALLY" extension for Chrome or Firefox.
   - Log into the site (e.g., YouTube) in your browser.
   - Export the cookies and save the file as `cookies.txt` in your project folder.

**2. Enable them in Docker**
   - Add the volume line in `docker-compose.yml`:
     ```yaml
     volumes:
       - ./downloads:/data/downloads
       - ./cookies.txt:/app/cookies.txt
     ```
   - Restart the container: `docker compose up -d`

> **Security Warning**
> Never share your `cookies.txt` file or commit it to Git. It contains your personal session data. MediaFetch is designed to read this file locally only.

---

## License

MIT License

---

## Credits

Core Power:
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- ffmpeg

---

Happy fetching.




