"""
Vocal separation and lyric transcription on Modal GPUs.

Deploy once with `modal deploy backend/modal_app.py` (see the README). The worker then calls these
instead of running Demucs and Whisper on its own machine. `Separator` runs the same
`services.voice_remover.separate_vocals` the worker would, so the stems are identical.

Both are classes so the model is loaded once when a container starts, and `warm` lets the worker
start a container ahead of time (while the audio is still downloading).
"""
import os
import queue
import threading
from pathlib import Path

import modal

APP_NAME = os.getenv("MODAL_APP_NAME", "kkaraoke")
# Tried in order: a T4 started faster and separated as fast as an L4 in measurements.
GPUS = [g.strip() for g in os.getenv("MODAL_GPU", "T4,L4").split(",") if g.strip()]
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
# A container is billed while it idles, so this is the price of the next song starting warm.
IDLE_S = int(os.getenv("MODAL_IDLE_SECONDS", "60"))

HERE = Path(__file__).parent

app = modal.App(APP_NAME)
# Model weights are downloaded on first use; keep them between containers.
weights = modal.Volume.from_name("kkaraoke-demucs-weights", create_if_missing=True)

separator_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.7.0", "torchaudio==2.7.0", "numpy==2.2.5",
        "dora-search==0.1.12", "einops==0.8.1", "julius==0.2.7", "lameenc==1.8.1",
        "omegaconf==2.3.0", "openunmix==1.3.0", "pyyaml==6.0.2", "tqdm==4.67.1",
        # utils.py (storage folders) imports these
        "fastapi==0.115.12", "python-dotenv==1.1.0",
    )
    # The pretrained checkpoints pickle classes from the top-level `demucs` package.
    .pip_install("demucs==4.0.1", extra_options="--no-deps")
    .env({"STORAGE_DIR": "/tmp/storage", "TORCH_HOME": "/weights/torch"})
    .add_local_file(HERE / "utils.py", "/root/utils.py")
    .add_local_file(HERE / "services" / "voice_remover.py", "/root/services/voice_remover.py")
    .add_local_dir(HERE / "services" / "demucs", "/root/services/demucs", ignore=["**/__pycache__"])
)

# CTranslate2 (faster-whisper) needs the CUDA and cuDNN libraries, which the torch wheels do not provide.
whisper_image = (
    modal.Image.from_registry("nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04", add_python="3.12")
    .apt_install("ffmpeg")
    .pip_install("faster-whisper>=1.1.1", "av>=15.1.0,<16")
    .env({"HF_HOME": "/weights/hf"})
)


@app.cls(image=separator_image, gpu=GPUS, cpu=4,  # cpu: the two MP3 encoders run in threads
         volumes={"/weights": weights}, timeout=900, scaledown_window=IDLE_S)
class Separator:
    @modal.enter()
    def load(self):
        from services.voice_remover import preload_model

        preload_model()

    @modal.method()
    def warm(self):
        """Does nothing: calling it starts a container (and loads the model) ahead of the real call."""

    @modal.method()
    def separate(self, audio: bytes, sid: str = "song"):
        """
        Split an mp3 into vocals and instrumental. A generator: yields `("progress", done, total)`
        while it works, then `("done", vocals_mp3, instrumental_mp3)`.
        """
        from services.voice_remover import separate_vocals
        from utils import NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR

        Path(RAW_AUDIO_DIR, f"{sid}.mp3").write_bytes(audio)
        events: queue.Queue = queue.Queue()

        def run():
            try:
                separate_vocals(sid, on_progress=lambda done, total: events.put(("progress", done, total)))
                events.put(("done", Path(VOCALS_DIR, f"{sid}.mp3").read_bytes(),
                            Path(NO_VOCALS_DIR, f"{sid}.mp3").read_bytes()))
            except BaseException as error:  # re-raised below, in the generator's own thread
                events.put(("error", error))

        threading.Thread(target=run, daemon=True).start()
        while True:
            event = events.get()
            if event[0] == "error":
                raise event[1]
            yield event
            if event[0] == "done":
                weights.commit()  # persist weights downloaded on a cold start
                return


@app.cls(image=whisper_image, gpu=GPUS, volumes={"/weights": weights}, timeout=900, scaledown_window=IDLE_S)
class Transcriber:
    models: dict

    @modal.enter()
    def load(self):
        self.models = {}
        self._model(WHISPER_MODEL)

    def _model(self, name: str):
        from faster_whisper import WhisperModel

        if name not in self.models:
            self.models[name] = WhisperModel(name, device="cuda", compute_type="float16")
        return self.models[name]

    @modal.method()
    def warm(self):
        """Does nothing: calling it starts a container (and loads the model) ahead of the real call."""

    @modal.method()
    def transcribe(self, audio: bytes, model: str = WHISPER_MODEL, suffix: str = ".mp3") -> dict:
        """What faster-whisper heard, as plain data: `{"language": str, "segments": [...]}`."""
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=suffix) as f:
            f.write(audio)
            f.flush()
            segments, info = self._model(model).transcribe(
                f.name, beam_size=5, vad_filter=True, word_timestamps=True)
            segments = list(segments)
        weights.commit()  # persist weights downloaded on a cold start
        return {
            "language": getattr(info, "language", "") or "",
            "segments": [{
                "start": s.start, "end": s.end, "text": s.text,
                "no_speech_prob": s.no_speech_prob, "avg_logprob": s.avg_logprob,
                "words": [[w.start, w.end, w.word] for w in (s.words or [])],
            } for s in segments],
        }


@app.local_entrypoint()
def main(path: str, out: str = ".", whisper: bool = False):
    """
    `modal run modal_app.py --path song.mp3`: separate one file, no backend needed.
    With `--whisper`, print what Whisper hears in the file instead.
    """
    import time

    src = Path(path)
    if whisper:
        start = time.monotonic()
        heard = Transcriber().transcribe.remote(src.read_bytes(), WHISPER_MODEL, src.suffix)
        for seg in heard["segments"]:
            print(f"{seg['start']:7.2f} {seg['text']}")
        print(f"TIMING whisper={WHISPER_MODEL} language={heard['language']} total={time.monotonic() - start:.1f}s")
        return

    Path(out).mkdir(parents=True, exist_ok=True)
    first = last = None
    start = time.monotonic()
    for event in Separator().separate.remote_gen(src.read_bytes()):
        if event[0] == "progress":
            first = first or time.monotonic()
            last = time.monotonic()
            print(f"\r{event[1] / event[2]:.0%}", end="", flush=True)
        else:
            _, vocals, instrumental = event
            done = time.monotonic()
            Path(out, f"{src.stem}.vocals.mp3").write_bytes(vocals)
            Path(out, f"{src.stem}.instrumental.mp3").write_bytes(instrumental)
            print(f"\nWrote {src.stem}.vocals.mp3 and {src.stem}.instrumental.mp3 to {out}")
            print(f"TIMING gpu={GPUS} start_to_first_progress={first - start:.1f}s "
                  f"compute={last - first:.1f}s encode+transfer={done - last:.1f}s total={done - start:.1f}s")
