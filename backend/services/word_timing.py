"""
Word-level timing from NetEase's "yrc" lyrics, when it has them.

The lyric sheets we trust (YouTube Music, LRCLib) time whole lines. NetEase publishes
per-word timings for many popular songs, but its search often returns a cover or a live
take, so nothing here is used on its own: lyrics_sources only attaches a word timing to a
line when that line already agrees with the sheet we verified, in text and in time.
"""
import logging
import re
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

log = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
# NetEase's length for the same studio recording is within a couple of seconds of ours;
# a live take or a cover is not.
MAX_DURATION_DIFF_S = 3

# Production credits are listed as lyric lines ("作词 : ...") with made-up timestamps.
_CREDIT = re.compile(
    r"^\s*(?:作[词詞曲]|[词詞曲](?=\s*[:：])|[编編]曲|[编編]寫|制作人?|製作人?|监制|監製|混音|母[带帶]|录音|錄音|和声|和聲|"
    r"[吉贝貝]他|贝斯|貝斯|鼓|弦乐|弦樂|企划|企劃|出品|发行|發行|OP|SP|"
    r"lyrics?|lyricist|compos\w*|produc\w*|arrang\w*|mix\w*|master\w*|guitar|bass|drums|"
    r"piano|strings|backing vocals?|vocals?|recording\w*|written by|words by|music by)"
    r"[^:：]{0,40}[:：]",
    re.IGNORECASE,
)


def is_credit_line(text: str) -> bool:
    return bool(_CREDIT.match(text))


@dataclass
class WordLine:
    start: float
    words: list[tuple[float, float, str]]  # (start_s, end_s, text)

    @property
    def text(self) -> str:
        return "".join(w[2] for w in self.words)


_LINE = re.compile(r"^\[(\d+),(\d+)\](.*)$")
_WORD = re.compile(r"\((\d+),(\d+),-?\d+\)")


def parse_yrc(raw: str) -> list[WordLine]:
    """`[lineStart,lineDur](wordStart,wordDur,0)text...` with times in milliseconds."""
    lines: list[WordLine] = []
    for row in raw.splitlines():
        m = _LINE.match(row.strip())
        if not m:
            continue  # JSON metadata rows and blanks
        body = m.group(3)
        tags = list(_WORD.finditer(body))
        words = []
        for i, tag in enumerate(tags):
            end_of_text = tags[i + 1].start() if i + 1 < len(tags) else len(body)
            text = body[tag.end():end_of_text]
            if text:
                start = int(tag.group(1)) / 1000
                words.append((start, start + int(tag.group(2)) / 1000, text))
        if words and not is_credit_line("".join(w[2] for w in words)):
            lines.append(WordLine(int(m.group(1)) / 1000, words))
    return lines


def find_netease_lines(
    title: str,
    duration_s: Optional[float],
    artist_ok: Callable[[list[str]], bool],
    fold: Callable[[str], str],
) -> Optional[list[WordLine]]:
    """The word-timed lines of NetEase's entry for this recording, if it has one."""
    try:
        r = httpx.post("https://music.163.com/api/search/get", timeout=10, headers=_HEADERS,
                       data={"s": title, "type": 1, "limit": 8, "offset": 0})
        songs = r.json().get("result", {}).get("songs", []) or []
    except Exception as e:  # noqa: BLE001 - an unofficial API; word timing is optional
        log.warning("NetEase search failed for %r: %r", title, e)
        return None

    want = fold(title)
    for song in songs:
        seconds = (song.get("duration") or 0) / 1000
        if duration_s and seconds and abs(seconds - duration_s) > MAX_DURATION_DIFF_S:
            continue
        have = fold(song.get("name") or "")
        if want not in have and have not in want:
            continue
        if not artist_ok([a.get("name", "") for a in song.get("artists", [])]):
            continue
        try:
            data = httpx.get("https://music.163.com/api/song/lyric", timeout=10, headers=_HEADERS,
                             params={"id": song["id"], "lv": 1, "kv": 1, "tv": -1, "yv": 1}).json()
        except Exception as e:  # noqa: BLE001
            log.warning("NetEase lyric fetch failed for %s: %r", song.get("id"), e)
            continue
        lines = parse_yrc((data.get("yrc") or {}).get("lyric") or "")
        if lines:
            return lines
    return None
