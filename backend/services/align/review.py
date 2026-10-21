"""
Whether an alignment can be trusted, from the measurements it already carries.

A gate over the aligner's own numbers (its score, which lines it located) rather than a guess, so a
caller can say "this sheet may not be this recording" without involving a model.
"""
from dataclasses import dataclass
from typing import Sequence

from .types import Line

# Above this score with everything anchored, the deterministic pipeline is
# already right.
REVIEW_SCORE_OK = 0.80
# Below this, the sheet is probably for a different song or recording.
REVIEW_SCORE_BAD = 0.50
# A contiguous run of unlocated lines this long means a structural mismatch
# (a cut verse, a medley, a reordered live take) rather than scattered noise.
REVIEW_RUN = 3
# Scattered unlocated lines are normal -- ad-libs, a line buried under
# instrumentation -- so only escalate once they are a real share of the song.
REVIEW_UNLOCATED_SHARE = 0.10


@dataclass
class Review:
    """Whether a result needs a second look, and what kind."""
    needed: bool
    reasons: list[str]
    kind: str          # "" | "retrieve" | "verify" | "structure" | "polish"

    def __bool__(self) -> bool:
        return self.needed


def review_needed(lines: Sequence[Line], score: float, source: str = "aligned") -> Review:
    """
    Decide whether a result is worth a second look.

    `kind` says which fits:
      retrieve  -- no usable sheet, so there is nothing to align against.
      verify    -- a sheet aligned badly; it is probably the wrong song or the wrong recording.
      structure -- most lines located but a solid block missing, which is what a cut verse or a
                   medley looks like.
      polish    -- scattered unlocated lines; the cheapest and least urgent.
    """
    reasons: list[str] = []
    kind = ""

    runs = unmatched_runs(lines)
    longest = max((len(r) for r in runs), default=0)
    unanchored = sum(1 for l in lines if not l.anchored)

    if source == "whisper":
        reasons.append("no lyric sheet was found; the text is Whisper's own")
        kind = "retrieve"
    elif source == "online":
        reasons.append(f"alignment failed (score {score:.2f}); kept the sheet's own timing")
        kind = "verify"
    elif score < REVIEW_SCORE_BAD:
        reasons.append(f"alignment score {score:.2f} is low; the sheet may be for a different song or recording")
        kind = "verify"
    elif longest >= REVIEW_RUN:
        reasons.append(f"{longest} consecutive lines were not located in the audio, which looks structural rather than noisy")
        kind = "structure"
    elif score < REVIEW_SCORE_OK or unanchored > max(1, len(lines) * REVIEW_UNLOCATED_SHARE):
        reasons.append(f"score {score:.2f} with {unanchored} of {len(lines)} line(s) unlocated")
        kind = "polish"

    return Review(needed=bool(kind), reasons=reasons, kind=kind)


def unmatched_runs(lines: Sequence[Line]) -> list[list[int]]:
    """Indices of unanchored lines, grouped into contiguous runs."""
    missing = [i for i, l in enumerate(lines) if not l.anchored]
    if not missing:
        return []
    runs: list[list[int]] = [[missing[0]]]
    for i in missing[1:]:
        if i == runs[-1][-1] + 1:
            runs[-1].append(i)
        else:
            runs.append([i])
    return runs
