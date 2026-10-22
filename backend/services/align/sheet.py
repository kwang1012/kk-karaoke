"""Getting a sheet into the aligner's shape: every line needs a time, even a rough one."""
import statistics
from typing import Optional, Sequence

# The aligner fits the sheet's own times to the audio's; a line with none gets one from its neighbours.
DEFAULT_GAP_S = 3.0


def fill_times(times: Sequence[Optional[float]], lo: float, hi: float) -> list[float]:
    """
    A time for every line. Known times are kept; a run of unknown ones is spread evenly between the
    known times around it, and past either end continues at the sheet's own typical spacing. A sheet
    with no times at all (pasted words) is spread evenly over [lo, hi], where the singing is.
    """
    n = len(times)
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        step = (hi - lo) / n if n and hi > lo else DEFAULT_GAP_S
        return [round(lo + step * i, 3) for i in range(n)]

    gaps = [(times[b] - times[a]) / (b - a) for a, b in zip(known, known[1:]) if times[b] > times[a]]  # type: ignore[operator]
    step = statistics.median(gaps) if gaps else DEFAULT_GAP_S
    out = [0.0] * n
    for i in known:
        out[i] = float(times[i])  # type: ignore[arg-type]
    for i in range(known[0] - 1, -1, -1):
        out[i] = max(0.0, out[i + 1] - step)
    for i in range(known[-1] + 1, n):
        out[i] = out[i - 1] + step
    for a, b in zip(known, known[1:]):
        for i in range(a + 1, b):
            out[i] = out[a] + (out[b] - out[a]) * (i - a) / (b - a)
    return [round(t, 3) for t in out]
