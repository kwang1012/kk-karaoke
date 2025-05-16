import re
from faster_whisper import WhisperModel
import difflib

import torch
import opencc

from utils import get_lyrics_path, get_vocal_path

def get_model_lyrics(track_id: str):
    path = get_vocal_path(track_id)
    if not path:
        return None
    model = WhisperModel(
        "turbo", "cuda" if torch.cuda.is_available() else "cpu", compute_type="float32")
    segments, info = model.transcribe(path, beam_size=5)

    print("Detected language '%s' with probability %f" %
          (info.language, info.language_probability))

    s2t = False
    converter = None
    if info.language == "zh":
        converter = opencc.OpenCC('s2t')
        s2t = True

    lines = []
    for segment in segments:
        print("[%.2fs -> %.2fs] %s" %
              (segment.start, segment.end, segment.text))
        if s2t and converter:
            segment.text = converter.convert(segment.text)
        lines.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text})

    return lines


def get_ground_truth_lyrics(track_id: str):
    # This function should return the ground truth lyrics as a string
    # For example, you can read from a file or hardcode it
    file_path = get_lyrics_path(track_id)
    if not file_path:
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()
    # Parse the lyrics file
    pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
    lyrics = []
    for line in raw_lines:
        match = pattern.match(line.strip())
        if match:
            text = match.group(4).strip()
            lyrics.append(text)
    return lyrics


def normalize(text):
    return text.strip().replace(" ", "").replace("，", "").replace(",", "")


def align_with_timestamps(segments, lyric_lines, threshold=0.3):
    model_texts = [normalize(s['text']) for s in segments]
    lyric_lines = [normalize(l) for l in lyric_lines]

    matcher = difflib.SequenceMatcher(None, model_texts, lyric_lines)
    aligned = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for i, j in zip(range(i1, i2), range(j1, j2)):
                aligned.append({
                    'start': segments[i]['start'],
                    'end': segments[i]['end'],
                    # original downloaded text (not normalized)
                    'text': lyric_lines[j]
                })
        elif tag in ('replace', 'delete'):
            for i in range(i1, i2):
                aligned.append({
                    'start': segments[i]['start'],
                    'end': segments[i]['end'],
                    'text': segments[i]['text']  # fallback to model
                })
        elif tag == 'insert':
            pass  # skip unmatched lyrics (no timestamp)

    return aligned

def to_lrc(segments):
    def ts(s): return f"[{int(s // 60):02d}:{s % 60:05.2f}]"
    return "\n".join(f"{ts(seg['start'])}{seg['text']}" for seg in segments if seg['text'].strip())

def main():
    track_id = "49MzKlO2t325zW3QDN2NW1"
    ground_truth_lyrics = get_ground_truth_lyrics(track_id)
    model_lyrics = get_model_lyrics(track_id)
    aligned_lyrics = align_with_timestamps(model_lyrics, ground_truth_lyrics)
    lrc_content = to_lrc(aligned_lyrics)
    print("LRC Content:")
    print(lrc_content)


if __name__ == "__main__":
    main()
