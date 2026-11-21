# Lookout

[![Docker image](https://github.com/gharl77/lookout/actions/workflows/docker.yml/badge.svg)](https://github.com/gharl77/lookout/actions/workflows/docker.yml)
![Version](https://img.shields.io/badge/version-0.1.0--beta-blue)
![Platforms](https://img.shields.io/badge/platforms-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)

*[Français](README.fr.md)*

Lookout is a self-hosted personal dashboard: news, weather, commute times, sports scores and tech headlines
on a single page. Everything is configured from the web UI — sections, their order, size and sources — and
every source is either an RSS feed or an API.

- One small container, no database, no external dependency
- Works in any browser; on iPhone it can be added to the Home Screen like an app
- Light and dark themes, accent colour, adjustable density and column count
- Bilingual interface (English / French)
- Polite to its sources: each one is queried at most once per interval (30 minutes by default), however often you reload

## Sections

| Section | Source | Key required |
|---|---|---|
| RSS feeds | Any RSS or Atom feed, with keyword filters and three layouts | No |
| Weather | [Open-Meteo](https://open-meteo.com) | No |
| Commute | OSRM, TomTom (live traffic) or a Home Assistant sensor | TomTom only |
| Sports scores | ESPN, HockeyTech (QMJHL, PWHL, OHL, WHL, AHL), API-Sports — pick teams per league | API-Sports only |
| JSON API | Any API returning a list, mapped by field path | Depends on the API |

## Quick start

### Docker Compose (recommended)

```yaml
services:
  lookout:
    image: ghcr.io/gharl77/lookout:latest
    container_name: lookout
    restart: unless-stopped
    ports:
      - "8765:8080"
    environment:
      TZ: America/Toronto
      # LOOKOUT_PASSWORD: change-me   # optional: require a password (user "lookout")
    volumes:
      - ./data:/data
```

```bash
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d
```

### Docker CLI

```bash
docker run -d \
  --name lookout \
  --restart unless-stopped \
  -p 8765:8080 \
  -e TZ=America/Toronto \
  -v /path/to/lookout/data:/data \
  ghcr.io/gharl77/lookout:latest
```

Then open `http://<server-ip>:8765` and click the gear icon to set up your sections.

## Parameters

### Ports

| Container | Description |
|---|---|
| `8080` | Web interface and API |

### Volumes

| Container path | Description |
|---|---|
| `/data` | Configuration (`config.json`), read state (`read.json`) and geocoding cache (`geocode.json`) |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TZ` | `Etc/UTC` | Time zone, used to decide what "today" means for scores (e.g. `America/Toronto`) |
| `LOOKOUT_PASSWORD` | *(none)* | When set, the interface asks for this password (HTTP Basic authentication) |
| `LOOKOUT_USER` | `lookout` | User name that goes with `LOOKOUT_PASSWORD` |
| `PORT` | `8080` | Port the server listens on inside the container |

## User and permissions

The container runs as UID/GID `1000:1000` and must be able to write to `/data`.

- **Bind mount** (as above): create the host folder first and make it writable by that user — `sudo chown 1000:1000 /path/to/lookout/data`. If the folder does not exist, Docker creates it as `root` and the container stops with a "cannot write to /data" message.
- **Another user**: add `user: "UID:GID"` to the compose file (or `--user UID:GID`) and give that user the folder.
- **Named volume**: works without any change.

## Image tags

| Tag | Description |
|---|---|
| `latest` | Latest build of the `main` branch |
| `v0.1.0-beta` | A specific release |

Images are built for `linux/amd64` and `linux/arm64`.

## Updating

```bash
docker compose pull && docker compose up -d
```

In Portainer: open the stack and choose **Re-pull image and redeploy**.

## Backup

Everything lives in the `/data` volume. Copy that folder, or use **Settings → Data → Export** to download
the configuration as a JSON file that can be imported into another instance.

## Security

Lookout is meant for a home network. Anyone who can reach it can read the dashboard and change its settings,
and API keys you enter are stored in plain text in `config.json`.

- Do not expose it directly to the Internet; use a VPN or a reverse proxy with HTTPS.
- Set `LOOKOUT_PASSWORD` if other people share your network.

## Hardened example

The container needs no extra privileges and can run with a read-only root filesystem:

```yaml
services:
  lookout:
    image: ghcr.io/gharl77/lookout:latest
    container_name: lookout
    restart: unless-stopped
    user: "1000:1000"
    ports:
      - "8765:8080"
    environment:
      TZ: America/Toronto
    volumes:
      - ./data:/data
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

## Building from source

Node.js 22 or later, no dependencies to install.

```bash
git clone https://github.com/gharl77/lookout.git
cd lookout
PORT=8080 node server.js        # run locally, data in ./data
docker build -t lookout .       # or build the image
```

Interface strings are written in French in the code; `public/i18n.js` holds their English translation.

Every build is tested before the image is published: a fresh install with default settings, a hardened
read-only install, and an unwritable data folder. Run the same checks against any instance with
`node scripts/smoke-test.mjs http://localhost:8080`.

## Disclaimer

Personal project, beta quality. The ESPN and HockeyTech sources are undocumented public APIs that may change
without notice. Respect the terms of use of each service you connect.
