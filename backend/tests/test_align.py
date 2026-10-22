"""
Regression tests for the lyric/audio alignment core, ported from the kscript prototype's
test_main.py. They cover the failure modes that made a greedy matcher unusable: CJK lines with no
spaces, Traditional vs Simplified drift, lines Whisper never transcribed, and hallucinated audio
before the first and after the last sung line. The frozen-song regression set is test_align_eval.py.
"""
from services.align import MIN_ALIGNMENT_SCORE, Line, Word, align_lines, review_needed
from services.align.core import ANCHOR_CONFIDENCE


def _sing(texts, start=20.0, per_char=0.45, gap=2.0):
    """Fake a Whisper word stream that sings `texts`; "" means a silent line."""
    words, t = [], start
    for text in texts:
        if not text:
            t += 7.0
            continue
        for ch in text:
            words.append(Word(word=ch, start=round(t, 3),
                              end=round(t + per_char * 0.9, 3)))
            t += per_char
        t += gap
    return words


LYRICS = ["城市的燈像遠方的星球閃爍",
          "我在人群裡繞著你的輪廓",
          "你說未來像一場無聲的漂流"]
# Deliberately wrong sheet timings: the aligner must derive times from audio.
ONLINE = [Line(time=i * 6.0, text=t) for i, t in enumerate(LYRICS)]


def test_cjk_lines_get_distinct_times():
    """The old matcher crushed every CJK line into the first few seconds."""
    out, score = align_lines(ONLINE, _sing(LYRICS))
    assert score > 0.95, score
    assert abs(out[0].time - 20.0) < 0.2, out[0].time
    assert out[0].time < out[1].time < out[2].time
    # Each line must span real time, not collapse to a point.
    assert all(l.end > l.time for l in out)
    assert len(out[0].words) == len(LYRICS[0])


def test_traditional_simplified_fold():
    """Whisper drifts into Simplified mid-song; that must still match."""
    simplified = ["城市的灯像远方的星球闪烁", "", "你说未来像一场无声的飘流"]
    out, _ = align_lines(ONLINE, _sing(simplified, start=12.0))
    assert out[0].confidence > 0.9, out[0].confidence
    assert abs(out[0].time - 12.0) < 0.3, out[0].time


def test_untranscribed_line_is_bracketed():
    """A line Whisper missed goes between its neighbours, not on top of one."""
    out, _ = align_lines(ONLINE, _sing([LYRICS[0], "", LYRICS[2]], start=12.0))
    assert out[0].time < out[1].time < out[2].time
    assert out[1].time >= out[0].end
    assert out[1].confidence < ANCHOR_CONFIDENCE


def test_hallucinated_intro_and_outro_ignored():
    """Free prefix/suffix: junk outside the song must not capture a line."""
    words = ([Word(word=c, start=0.5 + i * 0.3, end=0.8 + i * 0.3)
              for i, c in enumerate("啦啦啦隨便亂唱")]
             + _sing(LYRICS, start=12.0)
             + [Word(word=c, start=90 + i * 0.3, end=90.3 + i * 0.3)
                for i, c in enumerate("感謝收聽訂閱頻道")])
    out, _ = align_lines(ONLINE, words)
    assert abs(out[0].time - 12.0) < 0.5, out[0].time
    assert out[-1].time < 40, out[-1].time


def test_token_windows_stay_inside_their_line():
    out, _ = align_lines(ONLINE, _sing([LYRICS[0], "", LYRICS[2]], start=12.0))
    for l in out:
        for w in l.words:
            assert l.time <= w.start <= w.end <= l.end, (l.text, w)


def test_tokens_are_ordered_and_never_zero_width():
    """A zero-width token would never light up in a karaoke highlight."""
    out, _ = align_lines(_sheet(V1 + CH), _sing(V1 + CH))
    for l in out:
        assert l.words
        for a, b in zip(l.words, l.words[1:]):
            assert a.start <= b.start, (l.text, a, b)
        for w in l.words:
            assert w.end > w.start, (l.text, w)
            assert l.time - 1e-6 <= w.start and w.end <= l.end + 1e-6


def test_final_token_is_never_zero_width():
    """
    Regression: the last token of a line could start exactly at the line's
    end, leaving it zero-width so it never lit up. Seen on real output for
    '想念你想我' and four lines of 'After LIKE'.
    """
    # Two lines back to back, so line 1's end gets clamped to line 2's start
    # while its own final syllable is measured right at that boundary.
    online = [Line(time=0.0, text="想念你想我"),
              Line(time=6.0, text="城市的燈像遠方的星球閃爍")]
    words = _sing(["想念你想我", "城市的燈像遠方的星球閃爍"], start=20.0, gap=0.05)
    out, _ = align_lines(online, words)
    for l in out:
        assert l.words, l.text
        for w in l.words:
            assert w.end > w.start, (l.text, w)


def test_times_never_go_backwards():
    """Repeated choruses and partial matches must not reorder the sheet."""
    repeated = LYRICS + LYRICS
    online = [Line(time=i * 6.0, text=t) for i, t in enumerate(repeated)]
    out, _ = align_lines(online, _sing(repeated, start=15.0))
    assert all(out[i].time <= out[i + 1].time for i in range(len(out) - 1))


def test_backdated_first_character_ignored():
    """
    Whisper stretches the first character of a line across an instrumental
    gap; a plain min() over the line would then start it far too early.
    """
    words = ([Word(word="城", start=7.36, end=7.92)]
             + [Word(word=c, start=21.1 + i * 0.35, end=21.4 + i * 0.35)
                for i, c in enumerate("市閃動如風環抱雨的溫柔")])
    out, _ = align_lines([Line(time=12.86, text="城市閃動如風環抱雨的溫柔")],
                         words)
    assert 20.5 < out[0].time < 21.8, out[0].time


def test_dropped_line_opening_backs_off():
    """
    Whisper dropped the first half of the line; the measured onset belongs to
    the middle of it, so the line start must be extrapolated backwards.
    """
    words = [Word(word=c, start=92.77 + i * 0.45, end=93.1 + i * 0.45)
             for i, c in enumerate("遲來懂誰愛我")]
    out, _ = align_lines([Line(time=81.53, text="有一種揮霍 遲來懂誰愛我")],
                         words)
    # 5 unsung tokens ahead of the match, so it must start clearly earlier
    # than 92.77 without over-shooting into the previous line.
    assert 89.5 < out[0].time < 92.0, out[0].time


# --- sheet/recording divergence -------------------------------------------
# The sheet is not always the recording: radio edits cut verses, uploads add
# an a cappella intro, live versions reorder sections. These pin down what the
# aligner does in each case, and which cases it cannot handle.

V1 = ["城市的燈像遠方的星球閃爍", "我在人群裡繞著你的輪廓"]
V2 = ["你說未來像一場無聲的漂流", "我卻只想停在你懷中"]
CH = ["我繞著你降落 卻無法停泊", "像失速的心在邊緣閃爍"]


def _sheet(texts, start=18.0, step=6.0):
    return [Line(time=start + i * step, text=t) for i, t in enumerate(texts)]


def test_audio_with_extra_section_is_unaffected():
    """An extra chorus (or unlisted intro) is absorbed as insertions."""
    out, score = align_lines(_sheet(V1 + CH), _sing(V1 + CH + CH))
    assert score > 0.95, score
    assert all(l.anchored for l in out)


def test_sheet_verse_absent_from_audio_is_flagged():
    """A verse the recording cut must be reported, not silently timed."""
    out, _ = align_lines(_sheet(V1 + V2 + CH), _sing(V1 + CH))
    absent = [l for l in out if l.text in V2]
    assert all(not l.anchored for l in absent), "cut verse claimed as located"
    # The lines that *are* sung must still be timed correctly.
    assert all(l.anchored for l in out if l.text not in V2)


def test_different_arrangement_keeps_matching_lines():
    bridge = ["也許命運早已寫好結果", "我們只是擦肩的星火"]
    out, _ = align_lines(_sheet(V1 + V2), _sing(V1 + bridge))
    assert all(l.anchored for l in out if l.text in V1)
    assert all(not l.anchored for l in out if l.text in V2)


def test_wrong_sheet_scores_below_threshold():
    """A mismatched sheet must fall under the fallback threshold."""
    other = ["也許命運早已寫好結果", "我們只是擦肩的星火"]
    _, score = align_lines(_sheet(V1 + V2), _sing(other + CH))
    assert score < MIN_ALIGNMENT_SCORE, score


def test_reordering_is_not_silently_trusted():
    """
    Monotonic alignment cannot reorder sections. It must therefore not claim
    the misplaced lines are anchored -- a known limitation, surfaced.
    """
    out, _ = align_lines(_sheet(V1 + CH), _sing(CH + V1))
    assert not all(l.anchored for l in out)


def test_inflated_opening_syllable_is_trimmed():
    """
    Whisper gives a segment's first word the segment start time, so the
    opening syllable arrives stretched and the line fires early.
    """
    # 像 spans 1.14s; every syllable after it is ~0.4s (real observed values).
    words = [Word(word="像", start=73.08, end=74.22)]
    t = 74.22
    for ch in "失速的心在邊緣閃爍":
        words.append(Word(word=ch, start=round(t, 3), end=round(t + 0.40, 3)))
        t += 0.40
    out, _ = align_lines([Line(time=71.57, text="像失速的心在邊緣閃爍")], words)
    line = out[0]
    # The line must start close to 74.22 - one pace, not at 73.08.
    assert 73.6 < line.time < 74.3, line.time
    first = line.words[0]
    assert first.end - first.start < 0.8, (first.end - first.start)
    # And it must not overlap the syllable that follows it.
    assert first.end <= line.words[1].start + 1e-6


# --- escalation routing ----------------------------------------------------
# An LLM/agent pass is expensive and non-deterministic, so it must stay away
# from results the deterministic pipeline already got right. These pin the
# gate against the scores actually measured during development.

def _result(source, score, anchored_flags):
    return review_needed([Line(time=float(i), text="x", anchored=a) for i, a in enumerate(anchored_flags)],
                         score, source)


def test_good_results_are_left_alone():
    """繞著你降落 scored 0.93 with every line located -- do not escalate."""
    assert not _result("aligned", 0.93, [True] * 29)
    # 想念你想我: 0.85 with a single stray unlocated line is still fine.
    assert not _result("aligned", 0.85, [True] * 29 + [False])
    # 刪了: 0.81 with 3 of 43 unlocated, spread out -- scattered, not a block.
    flags = [True] * 43
    for i in (1, 20, 39):
        flags[i] = False
    assert not _result("aligned", 0.81, flags)


def test_missing_sheet_escalates_to_retrieval():
    """Correcting a transcript with no sheet recovers far less than finding
    the sheet does, so this is the highest-value escalation."""
    rv = _result("whisper", 0.0, [True] * 20)
    assert rv and rv.kind == "retrieve", rv


def test_wrong_sheet_escalates_to_verification():
    rv = _result("online", 0.18, [False] * 20)
    assert rv and rv.kind == "verify", rv
    rv = _result("aligned", 0.35, [True] * 20)
    assert rv and rv.kind == "verify", rv


def test_contiguous_gap_escalates_as_structural():
    """IVE After LIKE: 0.61 with a 6-line block missing -- a cut section or
    medley, which the monotonic aligner cannot handle."""
    rv = _result("aligned", 0.61, [True] * 11 + [False] * 6 + [True] * 25)
    assert rv and rv.kind == "structure", rv


def test_many_scattered_gaps_escalate_as_polish():
    """Enough unlocated lines to matter, but none adjacent -- so not
    structural. 5 of 20 is well past the 10% share."""
    flags = [True] * 20
    for i in (2, 6, 10, 14, 18):
        flags[i] = False
    rv = _result("aligned", 0.9, flags)
    assert rv and rv.kind == "polish", rv


def test_a_block_of_three_reads_as_structural_not_polish():
    """The distinction the gate turns on: same count, different shape."""
    adjacent = [True] * 20
    adjacent[5] = adjacent[6] = adjacent[7] = False
    assert _result("aligned", 0.9, adjacent).kind == "structure"
