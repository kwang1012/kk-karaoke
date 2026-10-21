"""Text folding for alignment: what counts as the same character in a sheet and in a transcript."""
import re
import unicodedata

from zhconv import convert as _zh_convert

# Han, Hiragana/Katakana, Hangul -> one token per character. Latin/digits ->
# one token per run. Everything else (punctuation, spaces) is not a token.
_TOKEN_RE = re.compile(
    r"[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]"
    r"|[0-9A-Za-z][0-9A-Za-z'’]*"
)

_FOLD_CACHE: dict[str, str] = {}


def fold_char(ch: str) -> str:
    """
    Normalise a single character for comparison.

    Folds Traditional -> Simplified Han so that a Traditional lyric sheet still
    matches a Whisper transcript that drifted into Simplified (Whisper does
    this mid-song constantly). Done per character to keep a 1:1 index mapping
    with the original text.
    """
    cached = _FOLD_CACHE.get(ch)
    if cached is not None:
        return cached
    out = unicodedata.normalize("NFKC", ch).lower()
    if len(out) == 1 and out >= "　":
        converted = _zh_convert(out, "zh-cn")
        if len(converted) == 1:
            out = converted
    _FOLD_CACHE[ch] = out
    return out


def tokenize(text: str) -> list[tuple[str, int]]:
    """Split a lyric line into (token, offset) pairs."""
    return [(m.group(0), m.start()) for m in _TOKEN_RE.finditer(text)]


def fold(text: str) -> str:
    """Folded, punctuation-free form of a whole string (for coarse compares)."""
    return "".join(fold_char(c) for tok, _ in tokenize(text) for c in tok)
