"""
Put a lyric sheet onto the audio's clock.

Ported from the kscript prototype. The sheet is the source of truth for *what* is sung and the
transcript (Whisper's timed characters) for *when*: the sheet's characters are fitted into the
transcript's, each line takes the clock of its own matched characters, lines that matched poorly
are filled in from a robust linear fit, and confirmed lines are snapped onto the vocal stem's
measured onsets. Everything here is a pure function of its arguments: no audio, model or network.
"""
import bisect
import logging
from dataclasses import dataclass
from typing import Sequence

from .text import fold_char, tokenize
from .types import Line, Word

log = logging.getLogger(__name__)


# A line needs this share of exactly-matched characters to be trusted as an
# anchor for the linear fit.
ANCHOR_CONFIDENCE = 0.40
# Below this mean confidence the sheet is probably not this recording's.
MIN_ALIGNMENT_SCORE = 0.30
# How far (seconds) a line's measured time may sit from the global anchor fit
# before we treat the match as coincidence rather than evidence.
OUTLIER_TOLERANCE = 6.0
# Consecutive characters of one sung line are never this far apart. A bigger
# gap means Whisper stretched an edge token across an instrumental passage.
MAX_INTRA_LINE_GAP = 2.5
# Whisper hands its first word the *segment's* start time, so the opening
# syllable of a line routinely comes back several times longer than the ones
# after it. A leading token longer than this multiple of the line's own pace
# is treated as inflated and trimmed back to that pace.
LEADING_INFLATION = 1.8


# -- Alignment -----------------------------------------------------------------

# Fitting-alignment scores. A gap is cheap relative to a mismatch so the
# aligner prefers skipping unintelligible audio over forcing a wrong pairing.
_MATCH = 2.0
_MISMATCH = -1.5
_GAP = -0.8


@dataclass
class RefChar:
    ch: str          # folded
    line: int
    token: int       # index into the flattened token list


@dataclass
class HypChar:
    ch: str          # folded
    start: float
    end: float


def ref_stream(lines: Sequence[Line]) -> tuple[list[RefChar], list[list[str]]]:
    """Flatten lyric lines into a folded character stream + per-line tokens."""
    stream: list[RefChar] = []
    tokens_per_line: list[list[str]] = []
    token_id = 0
    for li, line in enumerate(lines):
        toks = [t for t, _ in tokenize(line.text)]
        tokens_per_line.append(toks)
        for tok in toks:
            for ch in tok:
                folded = fold_char(ch)
                if folded.strip():
                    stream.append(RefChar(ch=folded, line=li, token=token_id))
            token_id += 1
    return stream, tokens_per_line


def hyp_stream(words: Sequence[Word]) -> list[HypChar]:
    """
    Flatten Whisper words into a folded character stream.

    Multi-character tokens (Whisper emits '開始' as one word) get their span
    split proportionally, so Chinese compares character-to-character.
    """
    stream: list[HypChar] = []
    for w in words:
        chars = [fold_char(c) for t, _ in tokenize(w.word) for c in t]
        chars = [c for c in chars if c.strip()]
        if not chars:
            continue
        span = max(0.0, w.end - w.start)
        step = span / len(chars)
        for i, ch in enumerate(chars):
            stream.append(HypChar(ch=ch,
                                   start=w.start + i * step,
                                   end=w.start + (i + 1) * step if step else w.end))
    return stream


def fitting_align(ref: Sequence[RefChar],
                   hyp: Sequence[HypChar]) -> list[int | None]:
    """
    Align the whole reference into the hypothesis (Needleman-Wunsch variant).

    Reference characters must all be consumed (gaps allowed but penalised),
    while the hypothesis may have free prefix and suffix -- Whisper output
    routinely carries junk before the first and after the last sung line.

    Returns, for each reference character, the hypothesis index it aligned to
    (or None if it had no counterpart).
    """
    n, m = len(ref), len(hyp)
    if not n or not m:
        return [None] * n

    ref_ch = [r.ch for r in ref]
    hyp_ch = [h.ch for h in hyp]

    # dp over one row at a time; ptr keeps the full traceback.
    #   0 = diagonal (pair), 1 = up (ref char unmatched), 2 = left (skip hyp)
    ptr = bytearray((n + 1) * (m + 1))
    prev = [0.0] * (m + 1)          # dp[0][j] = 0: free hypothesis prefix
    for j in range(1, m + 1):
        ptr[j] = 2

    for i in range(1, n + 1):
        cur = [0.0] * (m + 1)
        cur[0] = prev[0] + _GAP
        row = i * (m + 1)
        ptr[row] = 1
        a = ref_ch[i - 1]
        for j in range(1, m + 1):
            diag = prev[j - 1] + (_MATCH if a == hyp_ch[j - 1] else _MISMATCH)
            up = prev[j] + _GAP
            left = cur[j - 1] + _GAP
            if diag >= up and diag >= left:
                cur[j] = diag
                ptr[row + j] = 0
            elif up >= left:
                cur[j] = up
                ptr[row + j] = 1
            else:
                cur[j] = left
                ptr[row + j] = 2
        prev = cur

    # Free suffix: end wherever the last reference row scored best.
    j = max(range(m + 1), key=lambda k: prev[k])
    i = n
    mapping: list[int | None] = [None] * n
    while i > 0:
        d = ptr[i * (m + 1) + j]
        if d == 0:
            mapping[i - 1] = j - 1
            i -= 1
            j -= 1
        elif d == 1:
            i -= 1
        else:
            j -= 1
    return mapping


def robust_linear_fit(anchors: Sequence[tuple[float, float]]
                       ) -> tuple[float, float] | None:
    """
    Fit measured_time = a * lrc_time + b, rejecting outliers.

    The scale term matters: a YouTube upload may be pitch/speed-shifted or have
    a longer intro than the sheet assumes, and a pure offset cannot absorb that.
    """
    pts = list(anchors)
    if len(pts) < 4:
        return None
    a = b = 0.0
    for _ in range(4):
        n = len(pts)
        if n < 4:
            break
        sx = sum(p[0] for p in pts)
        sy = sum(p[1] for p in pts)
        sxx = sum(p[0] * p[0] for p in pts)
        sxy = sum(p[0] * p[1] for p in pts)
        denom = n * sxx - sx * sx
        if abs(denom) < 1e-9:
            return None
        a = (n * sxy - sx * sy) / denom
        b = (sy - a * sx) / n
        resid = sorted(abs(a * x + b - y) for x, y in pts)
        cutoff = max(2.5, resid[len(resid) // 2] * 3)
        kept = [p for p in pts if abs(a * p[0] + b - p[1]) <= cutoff]
        if len(kept) == n:
            break
        pts = kept
    if not 0.8 <= a <= 1.25:
        return None
    return a, b



def snap_to_onsets(lines: list[Line], onsets: Sequence[float],
                    tolerance: float = 0.7) -> int:
    """
    Pull each confirmed line onto the nearest measured vocal onset.

    Only `anchored` lines move, and only when an onset sits within
    `tolerance` -- so a line with no detectable onset nearby (buried under
    instrumentation, or simply absent) is left where the alignment put it.
    The line's tokens shift with it, because the drift being corrected is a
    property of the whole Whisper segment, not of one syllable.
    """
    if not onsets:
        return 0
    moved = 0
    for i, line in enumerate(lines):
        if not line.anchored:
            continue
        j = bisect.bisect_left(onsets, line.time)
        best = None
        for k in (j - 1, j):
            if 0 <= k < len(onsets):
                d = onsets[k] - line.time
                if abs(d) <= tolerance and (best is None or abs(d) < abs(best)):
                    best = d
        if best is None or abs(best) < 1e-3:
            continue
        # Never cross into a neighbouring line.
        lower = lines[i - 1].end if i else 0.0
        upper = lines[i + 1].time if i + 1 < len(lines) else line.end
        new_time = min(max(line.time + best, lower), max(upper, lower))
        delta = new_time - line.time
        if abs(delta) < 1e-3:
            continue
        line.time = round(new_time, 3)
        line.end = round(max(line.end + delta, line.time + 0.2), 3)
        for w in line.words:
            w.start = round(w.start + delta, 3)
            w.end = round(w.end + delta, 3)
        _fit_tokens_to_line(line.words, line.time, line.end)
        moved += 1

    # Shifting can only have nudged things; restore ordering.
    for i in range(1, len(lines)):
        if lines[i].time < lines[i - 1].time:
            lines[i].time = lines[i - 1].time
        if lines[i - 1].end > lines[i].time:
            lines[i - 1].end = round(max(lines[i - 1].time + 0.2,
                                         lines[i].time - 0.02), 3)
            _fit_tokens_to_line(lines[i - 1].words, lines[i - 1].time,
                                lines[i - 1].end)
    return moved


def _deinflate_leading(spans: list[tuple[int, float, float]]
                       ) -> list[tuple[int, float, float]]:
    """
    Trim an over-long opening syllable back to the line's own pace.

    Whisper (and MLX) assign a segment's start time to that segment's first
    word, so the syllable that opens a line comes back stretched -- measured
    at 1.5-1.9x the line's median syllable across these songs, and up to 3.6x.
    Because the line's timestamp is taken from that token, the whole line then
    fires early and the first syllable lights up long before the second.

    The syllable's *end* is trustworthy (it abuts the next one), so the start
    is pulled forward to sit one pace behind it.
    """
    if len(spans) < 4:
        return spans
    durs = sorted(e - s for _, s, e in spans[2:] if e > s)
    if not durs:
        return spans
    pace = durs[len(durs) // 2]
    if pace <= 0:
        return spans

    out = list(spans)
    limit = max(pace * LEADING_INFLATION, pace + 0.25)
    for i in (0, 1):
        idx, s, e = out[i]
        if e - s <= limit:
            break                                # not inflated; nor is the next
        new_start = e - pace
        if i > 0:                                # never overlap the token before
            new_start = max(new_start, out[i - 1][2])
        out[i] = (idx, min(max(new_start, s), e), e)
    return out


def _measure_line(spans: list[tuple[int, float, float]],
                  n_tokens: int) -> tuple[float, float] | None:
    """
    Turn a line's timed tokens into the line's own (start, end) window.

    Two corrections matter here:

    * Edge tokens sitting implausibly far from the rest of the line are
      dropped. Whisper habitually back-dates the first character after an
      instrumental passage -- it put "城" at 7.4s while the rest of that line
      sang at 21.1s, and a plain min() would report the line 14s early.
    * When the opening tokens were never transcribed at all (Whisper dropped
      "有一種揮霍" and picked the line up at "遲來..."), the first *timed*
      token is not the start of the line. So the window is extended backwards
      by the number of missing tokens times this line's own per-token pace,
      and likewise forwards for a missing tail.
    """
    lo, hi = 0, len(spans) - 1
    while lo < hi and spans[lo + 1][1] - spans[lo][2] > MAX_INTRA_LINE_GAP:
        lo += 1
    while hi > lo and spans[hi][1] - spans[hi - 1][2] > MAX_INTRA_LINE_GAP:
        hi -= 1
    spans = spans[lo:hi + 1]
    if not spans:
        return None

    durs = sorted(e - s for _, s, e in spans if e > s)
    pace = durs[len(durs) // 2] if durs else 0.35
    pace = min(max(pace, 0.15), 0.80)

    first_idx, start, _ = spans[0]
    last_idx, _, end = spans[-1]
    start -= min(first_idx * pace, 4.0)
    end += min((n_tokens - 1 - last_idx) * pace, 4.0)
    return max(0.0, start), max(end, start)


def align_lines(online: Sequence[Line],
                whisper_words: Sequence[Word],
                onsets: Sequence[float] | None = None,
                ) -> tuple[list[Line], float]:
    """
    Give each online lyric line a timestamp derived from the audio.

    Characters of the (correct) lyric text are aligned to the (timed) Whisper
    character stream; each line then takes the clock of its own matched
    characters. Lines that matched poorly -- instrumental-masked lines, ad-libs,
    Whisper dropouts -- are filled in from a robust linear fit over the lines
    that did match, then forced monotonic.

    `onsets` are the vocal stem's measured onsets (see onsets.py); without them the lines are not
    snapped. Returns (lines, mean_confidence).
    """
    ref, tokens_per_line = ref_stream(online)
    hyp = hyp_stream(whisper_words)
    if not ref or not hyp:
        return list(online), 0.0

    mapping = fitting_align(ref, hyp)

    n_tokens = sum(len(t) for t in tokens_per_line)
    # Per token: the hypothesis chars it captured.
    tok_start: list[float | None] = [None] * n_tokens
    tok_end: list[float | None] = [None] * n_tokens
    # Per line: exact matches and total characters, for confidence.
    exact = [0] * len(online)
    total = [0] * len(online)

    for idx, rc in enumerate(ref):
        total[rc.line] += 1
        h = mapping[idx]
        if h is None:
            continue
        hc = hyp[h]
        if hc.ch == rc.ch:
            exact[rc.line] += 1
        # Substitutions still carry position, so they inform timing; only exact
        # matches inform confidence.
        s, e = tok_start[rc.token], tok_end[rc.token]
        tok_start[rc.token] = hc.start if s is None else min(s, hc.start)
        tok_end[rc.token] = hc.end if e is None else max(e, hc.end)

    conf = [exact[i] / total[i] if total[i] else 0.0 for i in range(len(online))]

    # Measured line window from its tokens.
    measured: list[tuple[float, float] | None] = []
    base = 0
    for li, toks in enumerate(tokens_per_line):
        spans = [(k, tok_start[base + k], tok_end[base + k])
                 for k in range(len(toks))
                 if tok_start[base + k] is not None]
        spans = _deinflate_leading(spans)                 # type: ignore[arg-type]
        # Write back so the per-token karaoke timing agrees with the line time.
        for k, s, e in spans:
            tok_start[base + k], tok_end[base + k] = s, e
        base += len(toks)
        measured.append(_measure_line(spans, len(toks)))  # type: ignore[arg-type]

    trusted = [measured[i] is not None and conf[i] >= ANCHOR_CONFIDENCE
               for i in range(len(online))]
    bogus = [False] * len(online)

    def _anchors() -> list[tuple[float, float]]:
        return [(online[i].time, measured[i][0])         # type: ignore[index]
                for i in range(len(online)) if trusted[i]]

    fit = robust_linear_fit(_anchors())
    if fit:
        # A short line can match a hallucinated passage by pure coincidence
        # ("愛"/"你" turn up everywhere). The fit is robust to a few such
        # lines, so use it to throw them out and refit without them.
        for i in range(len(online)):
            if not trusted[i]:
                continue
            predicted = fit[0] * online[i].time + fit[1]
            if abs(measured[i][0] - predicted) > OUTLIER_TOLERANCE:  # type: ignore[index]
                trusted[i] = False
                # Actively wrong, not merely unconfirmed: drop the measurement
                # so it cannot leak into the line's end or token times.
                bogus[i] = True
        if any(bogus):
            log.debug("      demoted %d line(s) as off-fit outliers",
                      sum(bogus))
            fit = robust_linear_fit(_anchors()) or fit
        log.debug("      anchor fit: t_audio = %.4f * t_lrc + %.2f (%d anchors)",
                  fit[0], fit[1], len(_anchors()))

    starts = place_lines(online, measured, trusted, fit)

    out: list[Line] = []
    base = 0
    for i, line in enumerate(online):
        toks = tokens_per_line[i]
        next_start = starts[i + 1] if i + 1 < len(starts) else None
        meas_end = (measured[i][1]
                    if measured[i] is not None and not bogus[i] else None)
        end = (meas_end if meas_end is not None
               else starts[i] + 0.32 * max(1, len(toks)))
        # Only clamp against the next line when that would not collapse this
        # one -- an untrusted neighbour must never eat a well-matched line.
        if next_start is not None and next_start > starts[i]:
            end = min(end, next_start - 0.02)
        end = max(end, starts[i] + 0.20)

        blank: list[float | None] = [None] * len(toks)
        words = _interpolate_tokens(
            toks,
            blank if bogus[i] else tok_start[base:base + len(toks)],
            blank if bogus[i] else tok_end[base:base + len(toks)],
            starts[i], end)
        base += len(toks)
        # Guarantee every token window sits inside its own line window, stays
        # ordered, and keeps a non-zero width -- a zero-width token would
        # never light up in a karaoke highlight.
        _fit_tokens_to_line(words, starts[i], end)
        out.append(Line(time=round(starts[i], 3), text=line.text,
                        end=round(end, 3), confidence=round(conf[i], 3),
                        anchored=trusted[i], words=words))

    # Final refinement against the audio itself: Whisper's segment timing
    # drifts, the vocal stem's energy does not.
    try:
        if onsets:
            moved = snap_to_onsets(out, onsets)
            if moved:
                log.info("      snapped %d/%d line(s) to a measured vocal "
                         "onset (%d onsets found)", moved, len(out), len(onsets))
    except Exception as e:                       # refinement is best-effort
        log.warning("      onset refinement skipped: %s", e)

    score = (sum(conf[i] * total[i] for i in range(len(online)))
             / max(1, sum(total)))
    return out, score


def place_lines(online: Sequence[Line],
                 measured: Sequence[tuple[float, float] | None],
                 trusted: Sequence[bool],
                 fit: tuple[float, float] | None) -> list[float]:
    """
    Decide a start time for every line, including the ones the audio could not
    confirm.

    Well-matched lines keep their measured time. A run of unconfirmed lines
    *between* two matched lines is interpolated locally, preserving the
    relative spacing the LRC sheet gives it -- a local map beats the global
    fit because tempo drift and edits are gradual. Runs at the head or tail
    have only one neighbour, so those fall back to the global fit (or to a
    plain offset from the nearest match).
    """
    n = len(online)
    lrc = [l.time for l in online]
    starts: list[float] = [0.0] * n
    idx = [i for i in range(n) if trusted[i]]

    for i in idx:
        starts[i] = measured[i][0]                       # type: ignore[index]

    def guess(i: int) -> float:
        if fit:
            return fit[0] * lrc[i] + fit[1]
        if measured[i] is not None:
            return measured[i][0]                        # type: ignore[index]
        return lrc[i]

    if not idx:
        return [guess(i) for i in range(n)]

    # Head: before the first confirmed line. Clamped to stay behind it -- a
    # guessed line must never push a confirmed one out of place.
    first = idx[0]
    shift = starts[first] - lrc[first]
    for i in range(first):
        starts[i] = min(guess(i) if fit else lrc[i] + shift, starts[first])
    for i in range(first - 1, -1, -1):                  # keep the run ordered
        starts[i] = min(starts[i], starts[i + 1])

    # Tail: after the last confirmed line, clamped to stay ahead of it.
    last = idx[-1]
    shift = starts[last] - lrc[last]
    for i in range(last + 1, n):
        starts[i] = max(guess(i) if fit else lrc[i] + shift, starts[last])

    # Interior runs: linear map between the two bracketing confirmed lines.
    for a, b in zip(idx, idx[1:]):
        if b == a + 1:
            continue
        lo_l, hi_l = lrc[a], lrc[b]
        lo_a, hi_a = starts[a], starts[b]
        span_l = hi_l - lo_l
        for i in range(a + 1, b):
            if span_l > 1e-6:
                frac = min(1.0, max(0.0, (lrc[i] - lo_l) / span_l))
            else:
                frac = (i - a) / (b - a)
            starts[i] = lo_a + (hi_a - lo_a) * frac

    # Final safety pass: never let a start go backwards.
    for i in range(1, n):
        if starts[i] < starts[i - 1]:
            starts[i] = starts[i - 1]
    return [max(0.0, s) for s in starts]


def _fit_tokens_to_line(words: list[Word], start: float, end: float) -> None:
    """Clamp tokens into [start, end], keeping them ordered and non-degenerate."""
    if not words:
        return
    span = max(end - start, 1e-3)
    floor = min(0.05, span / (len(words) + 1))
    cursor = start
    for k, w in enumerate(words):
        remaining = len(words) - k
        # Reserve floor width for this token *and* every token after it -- only
        # reserving for the ones after lets the last token start exactly at
        # `end`, leaving it zero-width and permanently unlit.
        latest = end - floor * remaining
        w.start = min(max(w.start, cursor), max(latest, cursor))
        w.end = min(max(w.end, w.start + floor), end)
        cursor = w.start + floor
    for w in words:
        w.start = round(w.start, 3)
        # Rounding can still collapse a very narrow token; keep it visible.
        w.end = round(max(w.end, w.start), 3)
        if w.end <= w.start:
            w.end = round(w.start + 0.001, 3)


def _interpolate_tokens(tokens: Sequence[str],
                        starts: Sequence[float | None],
                        ends: Sequence[float | None],
                        line_start: float, line_end: float) -> list[Word]:
    """
    Give every token of a line a time window.

    Tokens the aligner matched keep their measured window. Unmatched runs are
    spread evenly across whatever room their neighbours leave them, so a token
    can never silently inherit the whole line's duration.
    """
    n = len(tokens)
    if not n:
        return []
    s: list[float | None] = [None if v is None else float(v) for v in starts]
    e: list[float | None] = [None if v is None else float(v) for v in ends]
    known = [k for k in range(n) if s[k] is not None]

    def spread(lo: float, hi: float, idxs: range) -> None:
        hi = max(hi, lo)
        step = (hi - lo) / max(1, len(idxs))
        for offset, k in enumerate(idxs):
            s[k] = lo + step * offset
            e[k] = lo + step * (offset + 1)

    if not known:
        spread(line_start, max(line_end, line_start + 0.2 * n), range(n))
    else:
        first, last = known[0], known[-1]
        if first > 0:
            spread(min(line_start, s[first]), s[first], range(first))  # type: ignore[arg-type]
        for a, b in zip(known, known[1:]):
            if b > a + 1:
                lo = e[a] if e[a] is not None else s[a]
                spread(lo, s[b], range(a + 1, b))       # type: ignore[arg-type]
        if last < n - 1:
            lo = e[last] if e[last] is not None else s[last]
            spread(lo, max(line_end, lo), range(last + 1, n))  # type: ignore[arg-type]

    words: list[Word] = []
    for k, tok in enumerate(tokens):
        start = float(s[k]) if s[k] is not None else line_start
        end = float(e[k]) if e[k] is not None else start
        words.append(Word(word=tok, start=round(start, 3),
                          end=round(max(end, start), 3)))
    return words
