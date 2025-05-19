import json
import torch
import torchaudio
import torchcrepe
import numpy as np
from utils import MIDI_DIR, get_vocal_path, get_midi_path


def extract_midi(track_id: str):

    vocal_path = get_vocal_path(track_id)

    if vocal_path is None:
        print("No vocal path found.")
        exit(1)

    audio, sr = torchaudio.load(vocal_path)
    audio = audio.mean(dim=0, keepdim=True)  # mono

    # Resample to 16kHz
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sr, new_freq=16000)
        audio = resampler(audio)
        sr = 16000

    hop_length = 80  # ~10ms frames
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    audio = audio.to(device)

    pitch, periodicity = torchcrepe.predict(
        audio,
        sample_rate=sr,
        hop_length=hop_length,
        model='tiny',  # 'tiny' for faster inference
        fmax=1100.0,
        batch_size=512,
        return_periodicity=True,
        device=device
    )

    pitch = pitch.squeeze().cpu().numpy()
    periodicity = periodicity.squeeze().cpu().numpy()
    timestamps = np.arange(len(pitch)) * hop_length / sr

    note_events = []
    min_duration = 0.05  # seconds
    confidence_thresh = 0.7

    last_note = None
    note_start_time = None

    for i, (freq, conf) in enumerate(zip(pitch, periodicity)):
        time = timestamps[i]
        if conf < confidence_thresh or freq == 0:
            if last_note is not None:
                duration = time - note_start_time
                if duration >= min_duration:
                    note_events.append({
                        "note": last_note,
                        "start": note_start_time,
                        "end": time
                    })
                last_note = None
            continue

        midi_note = int(round(69 + 12 * np.log2(freq / 440)))
        if midi_note != last_note:
            if last_note is not None:
                duration = time - note_start_time
                if duration >= min_duration:
                    note_events.append({
                        "note": last_note,
                        "start": note_start_time,
                        "end": time
                    })
            last_note = midi_note
            note_start_time = time

    # Save MIDI
    midi_path = f"{MIDI_DIR}/{track_id}.mid"
    with open(midi_path, 'w') as f:
        json.dump(note_events, f)
    print(f"Saved to {midi_path}")


if __name__ == "__main__":
    # Example usage
    track_id = "4qasQt2JsuBK8ZwERwuAZO"
    extract_midi(track_id)
