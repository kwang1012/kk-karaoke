"""
The ported aligner against the prototype's frozen songs.

`align_eval/` holds kscript's fixtures (sheet, Whisper words and vocal onsets of twelve real songs)
and its baseline.json. Every number the prototype recorded must come out the same here: a change
to the aligner that moves one is a decision, to be made on purpose and recorded with
`harness.py --save-baseline`, not something that slips in.
"""
import json
from pathlib import Path

import pytest

from align_eval import harness

HERE = Path(__file__).parent / "align_eval"
BASELINE = {row["id"]: row for row in json.loads((HERE / "baseline.json").read_text(encoding="utf-8"))}
FIXTURES = sorted((HERE / "fixtures").glob("*.json"))
# Wall time is the only number that is not a property of the alignment.
IGNORED = {"ms"}


def test_every_baseline_song_has_a_fixture_and_the_reverse():
    assert {harness.load(p)["id"] for p in FIXTURES} == set(BASELINE)
    assert len(FIXTURES) == 12


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.stem)
def test_song_matches_the_prototypes_baseline(path):
    fixture = harness.load(path)
    row = harness.score_one(fixture)
    got = {k: v for k, v in row.items() if not k.startswith("_") and k not in IGNORED}
    want = {k: v for k, v in BASELINE[fixture["id"]].items() if k not in IGNORED}
    assert got == want


def test_the_set_spans_good_partial_and_hopeless_songs():
    """A guard on the fixtures themselves: a regression set of only easy songs proves little."""
    scores = [row["score"] for row in BASELINE.values()]
    assert max(scores) > 0.9 and min(scores) < 0.05 and any(0.4 < s < 0.7 for s in scores)
