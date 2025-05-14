import argparse
from logging import fatal
import sys
from pathlib import Path
from typing import Any, List
import os
import typing
import torch as th

from services.downloader import NO_VOCALS_DIR, RAW_AUDIO_DIR, VOCALS_DIR
from services.demucs.apply import apply_model, BagOfModels
from services.demucs.audio import save_audio
from services.demucs.pretrained import get_model_from_args
from services.demucs.repo import ModelLoadingError
from services.demucs.separate import load_track


async def async_separate_vocals(sid: str, model_name: str = "htdemucs",
                                shifts: int = 1, overlap: float = 0.5,
                                stem: str = "vocals", int24: bool = False,
                                float32: bool = False, clip_mode: str = "rescale",
                                mp3: bool = True, mp3_bitrate: int = 320,
                                verbose: bool = True,
                                on_progress: typing.Optional[typing.Callable[[float, float], None]] = None):
    """Asynchronous wrapper for separate_vocals function."""
    separate_vocals(sid, model_name, shifts, overlap, stem, int24,
                    float32, clip_mode, mp3, mp3_bitrate, verbose, on_progress)


def separate_vocals(
    sid: str,
    model_name: str = "htdemucs",
    shifts: int = 1,
    overlap: float = 0.5,
    stem: str = "vocals",
    int24: bool = False,
    float32: bool = False,
    clip_mode: str = "rescale",
    mp3: bool = True,
    mp3_bitrate: int = 320,
    verbose: bool = True,
    on_progress: typing.Optional[typing.Callable[[
        float, float], None]] = None,
):
    """Separate the sources for the song ID

    Args:
        sid (Path): Song ID
        model (str): Model name
        shifts (int): Number of random shifts for equivariant stabilization.
                      Increase separation time but improves quality for Demucs.
                      10 was used in the original paper.
        overlap (float): Overlap
        stem (str): Only separate audio into {STEM} and no_{STEM}.
        int24 (bool): Save wav output as 24 bits wav.
        float32 (bool): Save wav output as float32 (2x bigger).
        clip_mode (str): Strategy for avoiding clipping: rescaling entire signal if necessary
                        (rescale) or hard clipping (clamp).
        mp3 (bool): Convert the output wavs to mp3.
        mp3_bitrate (int): Bitrate of converted mp3.
        verbose (bool): Verbose
    """

    if os.environ.get("LIMIT_CPU", False):
        th.set_num_threads(1)
        jobs = 1
    else:
        # Number of jobs. This can increase memory usage but will be much faster when
        # multiple cores are available.
        jobs = os.cpu_count()

    if th.cuda.is_available():
        device = "cuda"
    # elif th.backends.mps.is_available():
    #     device = "mps"
    else:
        device = "cpu"
    args = argparse.Namespace()
    args.sid = sid
    args.model = model_name
    args.device = device
    args.shifts = shifts
    args.overlap = overlap
    args.stem = stem
    args.int24 = int24
    args.float32 = float32
    args.clip_mode = clip_mode
    args.mp3 = mp3
    args.mp3_bitrate = mp3_bitrate
    args.jobs = jobs
    args.verbose = verbose
    args.filename = "{sid}.{ext}"
    args.split = True
    args.segment = None
    args.name = model_name
    args.repo = None

    model: Any = None
    try:
        model: Any = get_model_from_args(args)
    except ModelLoadingError as error:
        fatal(error.args[0])

    if args.segment is not None and args.segment < 8:
        fatal("Segment must greater than 8. ")

    if ".." in args.filename.replace("\\", "/").split("/"):
        fatal('".." must not appear in filename. ')

    if isinstance(model, BagOfModels):
        print(
            f"Selected model is a bag of {len(model.models)} models. "
            "You will see that many progress bars per track."
        )
        if args.segment is not None:
            for sub in model.models:
                sub.segment = args.segment
    else:
        if args.segment is not None:
            model.segment = args.segment

    model.to(device)
    model.eval()

    if args.stem is not None and args.stem not in model.sources:
        fatal(
            'error: stem "{stem}" is not in selected model. STEM must be one of {sources}.'.format(
                stem=args.stem, sources=", ".join(model.sources)
            )
        )

    if args.mp3:
        ext = "mp3"
    else:
        ext = "wav"
    vocal_stem = Path(VOCALS_DIR) / args.filename.format(
        sid=sid,
        ext=ext,
    )
    vocal_stem.parent.mkdir(parents=True, exist_ok=True)
    non_vocal_stem = Path(NO_VOCALS_DIR) / args.filename.format(
        sid=sid,
        ext=ext,
    )
    non_vocal_stem.parent.mkdir(parents=True, exist_ok=True)

    print(
        f"Separated tracks will be stored in {vocal_stem} and {non_vocal_stem}")
    track = Path(RAW_AUDIO_DIR, f"{sid}.mp3")
    if not track.exists():
        print(
            f"File {track} does not exist. If the path contains spaces, "
            'please try again after surrounding the entire path with quotes "".',
            file=sys.stderr,
        )
        return
    print(f"Separating track {track}")
    wav = load_track(track, model.audio_channels, model.samplerate)

    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()
    sources = apply_model(
        model,
        wav[None],
        device=args.device,
        shifts=args.shifts,
        split=args.split,
        overlap=args.overlap,
        progress=True,
        on_progress=on_progress,
        num_workers=args.jobs or 1,
    )[0]
    sources = sources * ref.std() + ref.mean()

    kwargs = {
        "samplerate": model.samplerate,
        "bitrate": args.mp3_bitrate,
        "clip": args.clip_mode,
        "as_float": args.float32,
        "bits_per_sample": 24 if args.int24 else 16,
    }
    sources = list(sources)
    save_audio(sources.pop(model.sources.index(args.stem)),
               str(vocal_stem), **kwargs)
    # Warning : after poping the stem, selected stem is no longer in the list 'sources'
    other_stem = th.zeros_like(sources[0])
    for i in sources:
        other_stem += i
    save_audio(other_stem, str(non_vocal_stem), **kwargs)


if __name__ == "__main__":
    def on_progress(progress: float, total: float):
        print(f"Progress: {progress}/{total} ({(progress/total)*100:.2f}%)")
    separate_vocals("test", on_progress=on_progress)
