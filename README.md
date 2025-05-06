---
title: KKaraoke
emoji: 🎤🎸🥁🎹
colorFrom: yellow
colorTo: purple
sdk: docker
app_port: "3000, 8000"
tags:
  [
    "audio",
    "music",
    "vocal-removal",
    "karaoke",
    "music-separation",
    "music-source-separation",
  ]
pinned: true
---

<h2 align="center">KKaraoke - The best Spotify-like karaoke web application</h1>
<p align="center">
    <a href="https://colab.research.google.com/drive/1ODoK3VXajprNbskqy7G8P1h-Zom92TMA?usp=sharing">
        <img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open In Colab">
    </a>
    <a href="https://huggingface.co/spaces/fabiogra/moseca">
        <img src="https://img.shields.io/badge/🤗%20Hugging%20Face-Spaces-blue" alt="Hugging Face Spaces">
    </a>
    <a href="https://huggingface.co/spaces/fabiogra/moseca/discussions?docker=true">
        <img src="https://img.shields.io/badge/-Docker%20Image-blue?logo=docker&labelColor=white" alt="Docker">
    </a>
    <a href="https://www.buymeacoffee.com/fabiogra">
        <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee--yellow.svg?logo=buy-me-a-coffee&logoColor=orange&style=social" alt="Buy me a coffee">
    </a>
</p>

---

<p align="center">
  <img src="https://i.imgur.com/QoSd3Fg.gif" alt="Demo KKaraoke"/>
</p>
<p align="center">
    <a href="https://www.producthunt.com/posts/moseca?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-moseca" target="_blank">
        <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=415833&theme=light" alt="KKaraoke - Extract vocals and instrument from any song | Product Hunt" width="250" height="54" />
    </a>
</p>

- [Setup](#setup)
  - [Local environment](#local-environment)
  - [Docker](#docker)
  - [(Optional) Preprocess tracks](#optional-preprocess-tracks)
  - [About](#about)
  - [Spotify Appearance](#spotify-appearance)
  - [Karaoke Fun](#karaoke-fun)
  - [Easy Deployment](#easy-deployment)
  - [Open-Source and Free](#open-source-and-free)
  - [Support](#support)
<!-- - [FAQs](#faqs)
  - [What is KKaraoke?](#what-is-moseca)
  - [Are there any limitations?](#are-there-any-limitations)
  - [How does KKaraoke work?](#how-does-moseca-work)
  - [How do I use KKaraoke?](#how-do-i-use-moseca)
  - [Where can I find the code for KKaraoke?](#where-can-i-find-the-code-for-moseca)
  - [How can I get in touch with you?](#how-can-i-get-in-touch-with-you) -->
- [Disclaimer](#disclaimer)

---

## Setup

### Local environment

#### Prerequisites:
1. ffmpeg in your system PATH.
2. A running redis in your system
3. A running postgres in you system

#### Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements
uvicorn main:app --reload
```

#### Frontend

```bash
cd frontend
yarn
yarn start
```

### Docker

You can also run the app with Docker:

```bash
docker build -t kkaraoke .
docker run -it --rm -p 3000:3000 8000:8000 $(DOCKER_IMAGE_NAME)
```

### (Optional) Preprocess tracks

If you want to preprocess the tracks so that the users can immediately enjoy the vocaless music, you can preprocess the tracks in advance.

```
cd backend
python -m scripts.process_default_queue.py
```

---

## About

Welcome to KKaraoke, your personal web application designed to redefine your music experience.
Whether you're a karaoke
enthusiast,
KKaraoke is for you.

### Spotify Appearance

<img title="Spotify Appearance" src="https://i.imgur.com/nsn3JGV.png" width="250" ></img>

<br>

Spotify-like user interface to allow you to start playing your favorite songs smoothly.

<br>

### Karaoke Fun

<img title="Karaoke Fun" src="https://i.imgur.com/nsn3JGV.png" width="250" ></img>

<br>

Engage with your favorite tunes in a whole new way!

KKaraoke offers an immersive online karaoke experience, allowing you to search
for any song on YouTube and remove the vocals online.

Enjoy singing along with high-quality instrumentals at the comfort of your home.

<br>

### Easy Deployment

With KKaraoke, you can deploy your personal KKaraoke app in the
<a href="https://huggingface.co/spaces/fabiogra/moseca?duplicate=true">
<img src="https://img.shields.io/badge/🤗%20Hugging%20Face-Spaces-blue"
alt="Hugging Face Spaces"></a> or locally with
[![Docker Call](https://img.shields.io/badge/-Docker%20Image-blue?logo=docker&labelColor=white)](https://huggingface.co/spaces/fabiogra/moseca/discussions?docker=true)
in just one click.

You can also speed up the music separation process by [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/1ODoK3VXajprNbskqy7G8P1h-Zom92TMA?usp=sharing) with GPU support.

<br>

### Open-Source and Free

KKaraoke is the free and open-source alternative to lalal.ai, splitter.ai or media.io vocal remover.

You can modify, distribute, and use it free of charge. I believe in the power of community
collaboration and encourage users to contribute to our source code, making KKaraoke better with
each update.

<br>

### Support

- Show your support by giving a star to the GitHub repository [![GitHub stars](https://img.shields.io/github/stars/fabiogra/moseca.svg?style=social&label=Star)](https://github.com/fabiogra/moseca).
- If you have found an issue or have a suggestion to improve KKaraoke, you can open an [![GitHub issues](https://img.shields.io/github/issues/fabiogra/moseca.svg)](https://github.com/fabiogra/moseca/issues/new)
- Enjoy KKaraoke? [![Buymeacoffee](https://img.shields.io/badge/Buy%20me%20a%20coffee--yellow.svg?logo=buy-me-a-coffee&logoColor=orange&style=social)](https://www.buymeacoffee.com/fabiogra)

---

## Disclaimer

KKaraoke is designed to separate vocals and instruments from copyrighted music for
legally permissible purposes, such as learning, practicing, research, or other non-commercial
activities that fall within the scope of fair use or exceptions to copyright. As a user, you are
responsible for ensuring that your use of separated audio tracks complies with the legal
requirements in your jurisdiction.