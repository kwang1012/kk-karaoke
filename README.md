<h1 align="center">KKaraoke - The best Spotify-like karaoke web application</h1>
<p align="center">
    <a href="https://kwang1012-kkaraoke.hf.space/">
        <img src="https://img.shields.io/badge/🤗%20Hugging%20Face-Spaces-blue" alt="Hugging Face Spaces">
    </a>
    <a href="https://hub.docker.com/r/kwang1012/kkaraoke">
        <img src="https://img.shields.io/badge/-Docker%20Image-blue?logo=docker&labelColor=white" alt="Docker">
    </a>
    <a href="https://buymeacoffee.com/bruce1198w">
        <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee--yellow.svg?logo=buy-me-a-coffee&logoColor=orange&style=social" alt="Buy me a coffee">
    </a>
</p>

<p align="center">
    <img src="https://imgur.com/xkm7lKt.gif" />
</p>

<h3 align="start"><a href="https://kwang1012-kkaraoke.hf.space/">DEMO</a></h3>

---

- [Setup](#setup)
  - [(Recommended) Docker](#docker)
  - [Local environment](#local-environment)
  - [(Optional) Preprocess tracks](#optional-preprocess-tracks)
- [About](#about)
  - [Spotify Appearance](#spotify-appearance)
  - [Easy Deployment](#easy-deployment)
  - [Open-Source and Free](#open-source-and-free)
- [FAQs](#faqs)
  - [Can I run KKaraoke on my device?](#can-i-run-kkaraoke-on-my-device)
  <!-- - [Are there any limitations?](#are-there-any-limitations)
  - [How does KKaraoke work?](#how-does-kkaraoke-work)
  - [How do I use KKaraoke?](#how-do-i-use-kkaraoke) -->
- [Disclaimer](#disclaimer)

---

## Setup

### AirPlay on a TV

Open **AirPlay setup** in Settings or TV mode for instructions. To show the lyrics,
TV screen, and audio together, use **Control Center → Screen Mirroring** on a Mac,
iPhone, or iPad, then choose an AirPlay-compatible TV or Apple TV on the same Wi-Fi.
Open `/tv`, tap the start screen to enable audio, and press **F** on a Mac for fullscreen.
Keep the page open and the device awake. Use the system default audio output in
KKaraoke; if needed, select the TV as the sound output in Control Center.

This uses Apple's system screen mirroring. The website cannot open that picker or
detect the connection, and does not stream the rendered lyrics through a media
AirPlay picker. Wireless latency may require adjusting lyrics sync.

### 1. Create your settings file

KKaraoke finds songs, albums and playlists on YouTube Music, which needs no account or API key.

```bash
cp backend/.env.example backend/.env
```

Configure the shared Cloudflare D1 catalog below before starting the API or worker. R2 is required when API and workers use separate disks.

### 2. Run it

Pick one.

#### Option A: Docker Compose (recommended)

Requires [Docker](https://docs.docker.com/get-docker/). Runs Redis, the API, the Celery worker
and nginx as separate containers, each restarted on its own if it dies.

```bash
docker compose up --build
```

Then open **http://localhost:8080**. The first build takes a few minutes (it installs PyTorch),
and the first song you play downloads the separation model, so expect a wait. Songs are stored
in `backend/storage`; the model is kept in a Docker volume. Stop with `docker compose down`.

For an NVIDIA GPU (needs the NVIDIA Container Toolkit on the host), add the GPU file:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

**One-line start/stop.**

```bash
./docker.sh up          # worker in Docker (add `gpu` for NVIDIA)
./docker.sh up local    # worker on your Mac (Apple GPU); log in .local-worker.log
./docker.sh down        # stop everything
./docker.sh status      # containers + where the worker runs
```

**Processing speed.** Removing the vocals from a 4-minute song takes roughly 5 minutes on a
10-core CPU in Docker (about 1.1 to 1.3 s of compute per second of audio), and roughly 2 minutes
with an Apple GPU (MPS) or less with an NVIDIA GPU. Docker on a Mac can't use the Apple GPU, so to
get it keep everything else in Docker and run only the worker on your Mac:

```bash
# 1. redis, api and web in Docker; Redis is published on localhost:6379 for the host worker
docker compose -f docker-compose.yml -f docker-compose.local-worker.yml up -d --build
# 2. make sure the Docker worker is not also running (it would take jobs and be slow)
docker compose stop worker
# 3. the worker, on your Mac (REDIS_AUTOSTART=0: fail instead of starting a second Redis)
cd backend && uv sync
REDIS_AUTOSTART=0 uv run celery -A services.process_request.celery worker -l info --concurrency=1 --pool=solo
```

Start the worker only after step 1, and use it with the same `backend/` folder (the Docker API
and the host worker share `backend/storage`). If step 1 fails with "port is already allocated",
something else is using `localhost:6379` (for example a Redis container or `redis-server` started
for local development): stop it first. Give Docker enough memory too; the default 8 GB is tight
while separating a song.

#### Optional: run separation and Whisper on a Modal GPU

Separating the vocals and transcribing lyrics (Whisper) are the slow steps. To run them on a
[Modal](https://modal.com) GPU instead of your own machine (the worker falls back to doing them
locally if Modal can't be reached; a container is started while the audio downloads, so it is ready
when needed):

```bash
cd backend
uv sync --extra modal
uv run modal setup                  # once: logs in to your workspace
uv run modal deploy modal_app.py    # deploys the `kkaraoke` app
echo "USE_MODAL=1" >> .env
```

In Docker or on a server, give the worker `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` (create them in
the Modal dashboard) and install the extra (`uv sync --extra modal`). `MODAL_GPU` (default `T4,L4`, tried in order)
`MODAL_IDLE_SECONDS` (default 60: how long an idle container stays up, and is billed) and `MODAL_APP_NAME` are optional. Whisper uses `WHISPER_MODEL`. Redeploy after changing `modal_app.py` or `services/demucs`.

#### Option B: Single container

Everything (Redis, API, worker, nginx) in one image:

```bash
docker build -t kkaraoke .
docker run -it --rm -p 8080:8080 -v $(pwd)/backend/storage:/app/backend/storage --env-file ./backend/.env kkaraoke
# NVIDIA GPU: add --gpus all
```

Then open **http://localhost:8080**. The image serves the frontend and API from the same
address, so it works from any host. To pin the API to a different address, build with
`--build-arg APP_ADDR=host:port`. The container exits if any of its services dies; add
`--restart unless-stopped` (and drop `--rm`) to have Docker bring it back.

#### Option C: Local development

Prerequisites: [uv](https://docs.astral.sh/uv/), ffmpeg on your PATH, and Node 22 with
Corepack (`corepack enable`; the frontend uses Yarn 4). Redis is started for you if none is
running (via Docker, or a local `redis-server`), as long as `REDIS_HOST` is local. Set
`REDIS_AUTOSTART=0` to disable that, and `CORS_ORIGINS` to restrict which origins may call the
API (see `backend/.env.example`).

### Shared catalog and file storage

**Cloudflare D1 is the catalog.** Every API and worker uses the same `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, and `D1_DATABASE_ID` in `backend/.env`. Create a custom Cloudflare API
token with **Account → D1 → Edit**, scoped to your account (this is separate from R2 access keys).
The token stays on the backend; it is never sent to the browser.

Initialize the database once, before starting the services:

```bash
cd backend
uv run python scripts/catalog_db.py setup  # creates/reuses karaoke-catalog if no database UUID is configured
uv run python scripts/catalog_db.py import --skip-redis  # one-time import of existing R2/disk manifests
uv run python scripts/catalog_db.py status
```

`setup` writes the selected database ID to `.env`; share that configuration with every API and
worker. `init` applies the schema to an already configured database. Import is repeatable and
preserves existing manifests and deletion tombstones. It reads small legacy metadata files but
never downloads audio. Omit `--skip-redis` to recover additional old song titles from Redis.

D1 stores song metadata, asset availability/versions/sizes, lyric provenance and line counts,
and durable job status/progress/results. Playback readiness requires published vocal and
instrumental assets; lyrics and melody are independent. Lists and status checks query D1,
without inspecting cached files, listing the bucket, or downloading audio.

**R2 stores bytes.** Configure `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
and `R2_BUCKET`. New files use immutable content-addressed R2 keys. A manifest becomes ready only
after its upload succeeds. Reads use the manifest version to validate the local copy and fetch
on a cache miss; a rebuild therefore invalidates old melody/audio copies on every machine.
Without R2, file storage is local and API/worker must share that disk, while the catalog still uses D1.

`backend/storage` (`STORAGE_DIR`) is disposable cache when using R2. Keep **`backend/data`
(`DATA_DIR`) durable**: it holds snapshots and retry journals for uploads not yet published.
Compose mounts both directories separately. On different machines, each worker must retain its
own outbox until its pending uploads complete. Startup does not sync the bucket. Background
maintenance retries outgoing uploads and dispatches unfinished D1 jobs; Redis remains the broker
and live room state, rather than the durable processing record.

From the repo root, start Redis (if needed), the API, the worker and the frontend with one command:

```bash
npm run dev      # or ./dev.sh   (first time: npm run install:all)
```

Worker output is written to `.local-worker.log` (`tail -f .local-worker.log` to follow it).

The admin worker page reads Redis snapshots. Each solo worker publishes a heartbeat every five
seconds and updates its task snapshot when tasks change; snapshots expire after 20 seconds.
Restart workers after upgrading to enable this publisher. The page does not send Celery control
requests, so a busy worker can still report its status.
Ctrl+C stops the services, allowing up to five seconds for shutdown before forcing remaining jobs to exit.

Or run each piece yourself in three terminals:

```bash
# 1. API (http://localhost:8000)
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

```bash
# 2. Celery worker (downloads audio and removes the vocals)
cd backend
uv run celery -A services.process_request.celery worker -l info --concurrency=1 --pool=solo
```

```bash
# 3. Frontend (open the URL it prints)
cd frontend
cp .env.example .env    # VITE_API_ADDR=localhost:8000
yarn
yarn start
```

### Troubleshooting

- **`container name ... is already in use`** after a failed `docker compose up`: run
  `docker compose down`, and if the name is still taken restart Docker Desktop.
- **Songs stay "processing"**: check the worker logs (`docker compose logs worker`); failed
  downloads or separations now show an error icon on the song.

### (Optional) Preprocess tracks

If you want to preprocess the tracks so that the users can immediately enjoy the vocaless music, you can preprocess the tracks in advance. 

```
cd backend
uv run python -m scripts.process_default_queue
```

---

## Hosting the frontend on Cloudflare Pages

The frontend is static, so it can be hosted on Cloudflare Pages (root directory `frontend`, build command
`yarn build`, output directory `build`; see `frontend/wrangler.toml`). The backend (API, Redis, worker) stays
on your machine. Until the site can reach one, it shows setup steps instead of the app:

1. `docker compose up --build`
2. `cloudflared tunnel --url http://localhost:8080` prints a public `https://…trycloudflare.com` address
3. Paste that address on the setup page (or open the site with `?backend=<address>`).

It is kept in the browser's local storage. The API's `GET /api/health` reports whether Redis and a worker are up.

## About

Welcome to KKaraoke, your personal web application designed to redefine your music experience.
Whether you're a karaoke
enthusiast,
KKaraoke is for you.

### Spotify Appearance

<img title="Spotify Appearance" src="https://imgur.com/qvdqtsc.png" width="150" ></img>

<br>

Spotify-like user interface to allow you to start playing your favorite songs smoothly.

Engage with your favorite tunes in a whole new way!

KKaraoke offers an immersive online karaoke experience, allowing you to search
for any song on YouTube Music and remove the vocals in the background.

Enjoy singing along with high-quality instrumentals at the comfort of your home.

<br>

### Easy Deployment

With KKaraoke, you can deploy your personal KKaraoke app in the
<a href="https://huggingface.co/spaces/fabiogra/moseca?duplicate=true">
<img src="https://img.shields.io/badge/🤗%20Hugging%20Face-Spaces-blue"
alt="Hugging Face Spaces"></a> or locally with
[![Docker Call](https://img.shields.io/badge/-Docker%20Image-blue?logo=docker&labelColor=white)](https://hub.docker.com/r/kwang1012/kkaraoke)
in just one click.

You can also speed up the music separation process by with GPU support.

<br>

### Open-Source and Free

KKaraoke is entirely free and open-source.

You can modify, distribute, and use it free of charge. I believe in the power of community
collaboration and encourage users to contribute to our source code, making KKaraoke better with
each update.

<br>

<!-- ### Support

- Show your support by giving a star to the GitHub repository [![GitHub stars](https://img.shields.io/github/stars/fabiogra/moseca.svg?style=social&label=Star)](https://github.com/fabiogra/moseca).
- If you have found an issue or have a suggestion to improve KKaraoke, you can open an [![GitHub issues](https://img.shields.io/github/issues/fabiogra/moseca.svg)](https://github.com/fabiogra/moseca/issues/new)
- Enjoy KKaraoke? [![Buymeacoffee](https://img.shields.io/badge/Buy%20me%20a%20coffee--yellow.svg?logo=buy-me-a-coffee&logoColor=orange&style=social)](https://www.buymeacoffee.com/fabiogra)

--- -->

---

## FAQs

### Can I run KKaraoke on my device?
KKaraoke is designed to be run on all devices. However, we highly recommend you to run KKaraoke on a device with the GPU access. KKaraoke also supports Apple GPUs with `torch.backends.mps`.

## Disclaimer

KKaraoke is designed to work from copyrighted music for
legally permissible purposes, such as learning, practicing, research, or other non-commercial
activities that fall within the scope of fair use or exceptions to copyright. As a user, you are
responsible for ensuring that your use of separated audio tracks complies with the legal
requirements in your jurisdiction.
