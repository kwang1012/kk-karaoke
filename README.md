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

### 1. Add your Spotify credentials

KKaraoke searches Spotify for songs, so it needs API credentials. Create an app at
https://developer.spotify.com/dashboard, then:

```bash
cp backend/.env.example backend/.env
```

and put your client id and secret in `backend/.env` (`SPOTIFY_CLIENT_ID`, `SPOTIFY_SECRET`).

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

### Cloudflare R2 storage

Set `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in
`backend/.env` (see `backend/.env.example`) to keep all processed data (lyrics, vocal and
instrumental stems, pitch MIDI) in an R2 bucket. `backend/storage` stays the local working copy;
R2 is the source of truth:

- when the API or a worker starts, it syncs: files in R2 that are missing on disk are downloaded,
  and files on disk that R2 lacks are uploaded (so an existing `storage/` migrates on first start);
  the API finishes this before resuming queued tracks, so already-processed songs aren't redone;
- new files are uploaded as soon as they are produced, and lyrics edits are written through.

Without these variables nothing changes and everything stays on local disk. The sync never
overwrites a file that exists on both sides, and R2 being unreachable only logs an error.

In three terminals:

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
for any song on Spotify and remove the vocals in the background.

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
