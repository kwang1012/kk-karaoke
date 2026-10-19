import os
import json
import re
import shutil
import subprocess
from pathlib import Path
from difflib import SequenceMatcher

import whisper
from textgrid import TextGrid
from syncedlyrics import search

# Optional: import lyricsgenius for fallback plain lyrics
# import lyricsgenius

WORK_DIR = Path("synced_lyrics")
AUDIO_DIR = WORK_DIR / "audio"
TRANSCRIPT_DIR = WORK_DIR / "transcripts"
DICT_PATH = WORK_DIR / "dicts" / "mixed.dict"
OUTPUT_DIR = WORK_DIR / "output"

for d in [AUDIO_DIR, TRANSCRIPT_DIR, OUTPUT_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def fetch_audio(song_name: str) -> Path:
    import yt_dlp
    output_template = str(AUDIO_DIR / "%(title)s.%(ext)s")
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        'quiet': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{song_name}", download=True)
        entry = info['entries'][0]
        return Path(ydl.prepare_filename(entry)).with_suffix(".wav")


def transcribe_whisper(audio_path: Path):
    model = whisper.load_model("large")
    result = model.transcribe(str(audio_path), language=None, word_timestamps=True)
    return result


def fetch_synced_lyrics(song_name: str):
    results = search(song_name, providers=[
                        "Lrclib", "NetEase", "Megalobiz", "Genius"])
    if not results:
        print("⚠️ No synced lyrics found")
        return None
    return results.split("\n")

def parse_lrc_lines(lrc_lines):
    pattern = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)")
    lyrics = []
    for line in lrc_lines:
        print(line)
        match = pattern.match(line.strip())
        if match:
            # minutes = int(match.group(1))
            # seconds = float(match.group(2))
            # ms = float("0." + match.group(3))

            # timestamp = round(minutes * 60 + seconds + ms, 2)
            text = match.group(4).strip()
            lyrics.append(text)
    return lyrics

def similarity_score(lrc_lines, whisper_segments):
    lrc_text = " ".join(parse_lrc_lines(lrc_lines)).lower()
    whisper_text = " ".join(seg['text'] for seg in whisper_segments).lower()
    return SequenceMatcher(None, lrc_text, whisper_text).ratio()


def save_lyrics_txt(lines, lyrics_path: Path):
    with open(lyrics_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def run_mfa(audio_path: Path, transcript_path: Path, acoustic_model: str):
    subprocess.run([
        "mfa", "align",
        str(AUDIO_DIR), str(DICT_PATH), acoustic_model, str(OUTPUT_DIR), "--clean"
    ], check=True)


def export_textgrid(textgrid_path: Path):
    tg = TextGrid.fromFile(textgrid_path)
    words = tg.getFirst("words")

    def format_lrc_time(t):
        m, s = divmod(t, 60)
        return f"[{int(m):02}:{int(s):02}.{int((s % 1) * 100):02}]"

    lrc_out = []
    json_out = []

    for interval in words:
        if interval.mark.strip():
            lrc_out.append(f"{format_lrc_time(interval.minTime)}{interval.mark.strip()}")
            json_out.append({
                "word": interval.mark.strip(),
                "start": interval.minTime,
                "end": interval.maxTime
            })

    base = textgrid_path.stem
    with open(OUTPUT_DIR / f"{base}.lrc", "w", encoding="utf-8") as f:
        f.write("\n".join(lrc_out))

    with open(OUTPUT_DIR / f"{base}.json", "w", encoding="utf-8") as f:
        json.dump(json_out, f, ensure_ascii=False, indent=2)


def main(song_name: str):
    base_name = song_name.replace(" ", "_").replace("/", "_")
    audio_path = AUDIO_DIR / f"{base_name}.wav"
    whisper_path = TRANSCRIPT_DIR / f"{base_name}.whisper.json"
    synced_path = TRANSCRIPT_DIR / f"{base_name}.synced.json"
    lyrics_path = TRANSCRIPT_DIR / f"{base_name}.txt"
    textgrid_path = OUTPUT_DIR / f"{base_name}.TextGrid"
    lrc_path = OUTPUT_DIR / f"{base_name}.lrc"
    json_path = OUTPUT_DIR / f"{base_name}.json"

    # --- Audio ---
    if not audio_path.exists():
        print(f"🔍 Downloading audio for: {song_name}")
        tmp_path = fetch_audio(song_name)
        shutil.move(tmp_path, audio_path)
    else:
        print("🎵 Audio already downloaded")

    # --- Whisper ---
    if not whisper_path.exists():
        print("🗣 Transcribing with Whisper...")
        whisper_result = transcribe_whisper(audio_path)
        with open(whisper_path, "w", encoding="utf-8") as f:
            json.dump(whisper_result, f, ensure_ascii=False, indent=2)
    else:
        print("📄 Using cached Whisper result")
        with open(whisper_path, "r", encoding="utf-8") as f:
            whisper_result = json.load(f)

    whisper_segments = whisper_result["segments"]
    detected_lang = whisper_result["language"]

    # --- Synced Lyrics ---
    use_synced = False
    if not synced_path.exists():
        print("🎼 Fetching synced lyrics...")
        lrc_lines = fetch_synced_lyrics(song_name)
        if lrc_lines:
            with open(synced_path, "w", encoding="utf-8") as f:
                json.dump(lrc_lines, f, ensure_ascii=False)
    else:
        print("🎼 Using cached synced lyrics")
        with open(synced_path, "r", encoding="utf-8") as f:
            lrc_lines = json.load(f)

    if lrc_lines:
        score = similarity_score(lrc_lines, whisper_segments)
        print(f"🧠 LRC similarity score: {score:.2f}")
        if score > 0.8:
            use_synced = True
            plain_lines = [line for _, line in lrc_lines]
        else:
            print("⚠️ Synced lyrics not accurate enough, falling back to MFA")

    if not use_synced:
        plain_lines = [seg['text'].strip() for seg in whisper_segments]

    # --- Lyrics.txt ---
    if not lyrics_path.exists():
        save_lyrics_txt(plain_lines, lyrics_path)
    else:
        print("📜 Using cached lyrics.txt")

    # --- MFA ---
    if not textgrid_path.exists():
        print("📐 Running MFA alignment...")
        lang_model_map = {
            "ko": "korean_mfa",
            "ja": "japanese_mfa",
            "zh": "mandarin_mfa",
            "en": "english_mfa"
        }
        mfa_model = lang_model_map.get(detected_lang, "english_mfa")
        run_mfa(audio_path, lyrics_path, mfa_model)
    else:
        print("📏 MFA alignment already exists")

    # --- Export ---
    if not (lrc_path.exists() and json_path.exists()):
        print("📤 Exporting .lrc and .json from TextGrid...")
        export_textgrid(textgrid_path)
    else:
        print("✅ Already exported .lrc and .json")

    print("🎉 All done!")



# Example usage
if __name__ == "__main__":
    main("IVE - After LIKE")
