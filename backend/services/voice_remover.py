import subprocess
import os
from pathlib import Path
import shutil

def separate_vocals_with_demucs(input_path: str, output_base: str = "separated"):
    """
    Runs Demucs on an audio file to separate stems and extract accompaniment.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Audio file not found: {input_path}")

    # Run Demucs
    result = subprocess.run(
        ["demucs", str(input_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    if result.returncode != 0:
        print("Demucs failed:\n", result.stderr)
        return None

    # Output is typically: separated/demucs/<song name>/
    song_name = input_path.stem
    demucs_output_dir = Path(output_base) / "htdemucs" / song_name  # For htdemucs model
    # or Path(output_base) / "demucs" / song_name depending on version

    accompaniment_path = demucs_output_dir / "no_vocals.wav"
    def combine_with_torchaudio(stem_dir, output_path):
        parts = []
        for name in ["drums", "bass", "other"]:
            waveform, sr = torchaudio.load(f"{stem_dir}/{name}.wav")
            parts.append(waveform)
        
        instrumental = sum(parts)  # Add tensors
        torchaudio.save(output_path, instrumental, sr)
    combine_with_torchaudio(demucs_output_dir, accompaniment_path)

instrumental_path = separate_vocals_with_demucs("storage/raw_songs/test.mp3")
print("Instrumental saved to:", instrumental_path)