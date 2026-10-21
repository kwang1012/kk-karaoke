"""FFmpeg must never read the dev terminal from a background worker."""
import subprocess

import numpy as np

from services.demucs.audio import AudioFile


def test_audio_read_disables_interactive_input(monkeypatch):
    audio = AudioFile('test.mp3')
    audio._info = {
        'format': {'duration': '1'},
        'streams': [{'codec_type': 'audio', 'channels': 2, 'sample_rate': '44100'}],
    }
    commands = []

    def run(command, **options):
        commands.append(command)
        assert '-nostdin' in command
        assert options['stdin'] == subprocess.DEVNULL
        assert options['check'] is True
        np.zeros(8, dtype=np.float32).tofile(command[-1])

    monkeypatch.setattr('services.demucs.audio.sp.run', run)
    wav = audio.read(samplerate=44100)
    assert len(commands) == 1
    assert wav.shape == (1, 2, 4)
