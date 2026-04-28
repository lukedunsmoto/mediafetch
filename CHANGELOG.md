# Changelog

All notable changes to this project are documented in this file.

## [1.3.1] - 2026-04-26

### Changed
- Hard-pinned update checks to the official MediaFetch release channel (`lukedunsmoto/mediafetch`) in `server.js`.
- Updated package version from `1.3.0` to `1.3.1` in `package.json`.
- Updated Docker image tag from `1.3.0` to `1.3.1` in `docker-compose.yml`.

### Removed
- Removed `GITHUB_REPO` from user configuration (`.env.example` and `docker-compose.yml`) so update checks are zero-config.
- Removed `GITHUB_REPO` from README environment variable documentation.

## [1.3.0] - 2026-04-21

### Added
- Added a footer inside the main UI card in `public/index.html` with:
  - `By Luke Dunsmore` link (`https://www.lukedunsmore.com`)
  - GitHub icon link (`https://github.com/lukedunsmoto/mediafetch`)
  - Email icon link (`mailto:support@lukedunsmore.com`)
- Added a bottom-right update notification card in `public/index.html`.
- Added dismiss support for update notifications using `localStorage`, keyed per version.
- Added a new backend endpoint `GET /api/version` in `server.js`.
- Added GitHub release/tag version lookup in `server.js` using Node's built-in `https` module.
- Added server-side cache for version checks in `server.js` using `VERSION_CHECK_TTL_MS`.
- Added job concurrency control in `server.js` via `MAX_CONCURRENT_JOBS`.
- Added per-job timeout handling in `server.js` via `JOB_TIMEOUT_MS`.
- Added numeric env validation in `server.js` for `MAX_CONCURRENT_JOBS`, `JOB_TIMEOUT_MS`, and `VERSION_CHECK_TTL_MS` with safe minimum values.
- Added `.gitignore` with protections for `.env`, `downloads/`, `cookies.txt`, logs, and OS junk files.
- Added new environment variables to `.env.example`:
  - `MAX_CONCURRENT_JOBS`
  - `JOB_TIMEOUT_MS`
  - `VERSION_CHECK_TTL_MS`

### Changed
- Updated package version from `1.2.0` to `1.3.0` in `package.json`.
- Updated Docker image tag from `1.2.0` to `1.3.0` in `docker-compose.yml`.
- Updated `docker-compose.yml` to pass new env vars:
  - `MAX_CONCURRENT_JOBS`
  - `JOB_TIMEOUT_MS`
  - `VERSION_CHECK_TTL_MS`
- Updated README feature list with in-app update notice details.
- Expanded README environment variable table with runtime safeguard and update-check variables.
- Updated README release/update wording to align prebuilt-image quick start with source build behaviour.
- Updated README quick-start wording to clarify prebuilt image usage vs local source build.
- Expanded README API section to document `GET /api/version`.
- Updated client-side error log handling in `public/index.html` to avoid showing an undefined exit code when only an error message is returned.
- Updated Basic Auth credential comparison in `server.js` to use timing-safe checks.

### Removed
- Removed unused `express-basic-auth` dependency from `package.json`.

### Notes
- This release intentionally keeps the project lean: no frontend build step, no database, no queue worker, and no added heavy dependencies.
