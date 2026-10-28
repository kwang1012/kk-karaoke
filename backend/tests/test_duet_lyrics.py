"""Duet parts retain identity and independent clocks across parsing and persistence."""
from services import providers as pv, lyrics_sources as ls

TTML = '''<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
<head><metadata><ttm:agent type="person" xml:id="v1"><ttm:name>Ada</ttm:name></ttm:agent>
<ttm:agent type="person" xml:id="v2"/><ttm:agent type="group" xml:id="v3"/></metadata></head>
<body><div ttm:agent="v1">
<p begin="10" end="14"><span begin="10" end="14">Hello</span></p>
<p begin="10" end="12" ttm:agent="v2"><span begin="10" end="12">World</span></p>
<p begin="15" end="18" ttm:agent="v3">Together</p>
<p begin="20" end="24"><span begin="20" end="24">Lead</span><span ttm:role="x-bg" ttm:agent="v2"><span begin="21" end="23">Echo</span></span></p>
</div></body></tt>'''


def test_ttml_inherits_agents_keeps_groups_and_separates_nested_backing_vocals():
    lines = pv.parse_ttml_lines(TTML)
    assert [line.start for line in lines] == [10, 10, 15, 20, 21]
    assert [line.text for line in lines] == ['Hello', 'World', 'Together', 'Lead', 'Echo']
    assert lines[0].singer == {'id': 'v1', 'kind': 'person', 'slot': 1, 'name': 'Ada'}
    assert lines[1].singer == {'id': 'v2', 'kind': 'person', 'slot': 2}
    assert lines[2].singer['kind'] == 'group'
    assert not lines[2].words  # line-timed text never becomes a made-up timed word
    assert lines[4].role == 'background' and lines[4].words == [(21, 23, 'Echo')]
    assert len({line.line_id for line in lines}) == len(lines)


def test_equal_start_words_do_not_overwrite_each_other_in_saved_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, 'LYRICS_DIR', str(tmp_path))
    entry = pv.Entry('unison', 'Song', ['A', 'B'], 100)
    pv._read_unison(entry, {'format': 'ttml', 'lyrics': TTML})
    result = ls._word_result(entry, 'vid')
    ls.save_result('duet', result)
    meta = ls.read_meta('duet')
    first = ls.details_for_line(meta, 0, 10, 'Hello')
    second = ls.details_for_line(meta, 1, 10, 'World')
    assert first['id'] != second['id']
    assert first['words'][0]['text'] == 'Hello' and first['words'][0]['end'] == 14
    assert second['words'][0]['text'] == 'World' and second['words'][0]['end'] == 12
    assert ls.details_for_line(meta, 0, 10, 'Replaced') == {}
    assert ls.details_for_line(meta, 0, 11, 'Hello') == {}


def test_line_only_ttml_retains_singer_metadata_when_used_as_a_fallback(monkeypatch):
    entry = pv.Entry('unison', 'Song', ['A', 'B'], 100)
    pv._read_unison(entry, {'format': 'ttml', 'lyrics': TTML.replace('<span begin="10" end="14">Hello</span>', 'Hello')
                        .replace('<span begin="10" end="12">World</span>', 'World')
                        .split('<p begin="20"')[0] + '</div></body></tt>'})
    assert entry.word_lines is None
    monkeypatch.setattr(pv, 'find_word_entry', lambda *a, **k: None)
    monkeypatch.setattr(ls, '_fetch_lrclib', lambda *a: None)
    monkeypatch.setattr(pv, 'find_entry', lambda *a, **k: entry)
    result = ls.find_lyrics('Song', ['A', 'B'], None, 100, None, korean=False)
    assert result.lines[1]['singer']['id'] == 'v2'
    assert result.lines[1]['end'] == 12


def test_lrc_section_markers_apply_to_following_lines_and_never_become_lyrics():
    lines = [dict(time=time, text=text) for time, text in [
        (14.45, '男：'), (15.13, 'First'), (21.72, 'Second'),
        (39.87, '女：'), (41.53, 'Reply'), (47.48, '合：'), (48, 'Together'),
    ]]
    normalized = ls.normalize_vocal_markers(lines)
    assert [line['text'] for line in normalized] == ['First', 'Second', 'Reply', 'Together']
    assert [line['time'] for line in normalized] == [15.13, 21.72, 41.53, 48]
    assert [line['singer']['slot'] for line in normalized] == [1, 1, 2, 0]
    assert normalized[-1]['singer']['kind'] == 'group'
    assert lines[0]['text'] == '男：'  # The stored provider sheet is not mutated.


def test_inline_singer_prefixes_are_removed_without_guessing_unmarked_text():
    lines = [{'time': 1, 'text': '男女都一樣'}, {'time': 2, 'text': '（女）Reply'},
             {'time': 3, 'text': '男：Answer', 'words': [{'start': 3, 'end': 4, 'text': '男：Answer'}]},
             {'time': 4, 'text': '合唱：Together'}]
    normalized = ls.normalize_vocal_markers(lines)
    assert normalized[0] == lines[0]
    assert normalized[1]['text'] == 'Reply' and normalized[1]['singer']['slot'] == 2
    assert normalized[2]['text'] == 'Answer' and normalized[2]['words'] is None
    assert normalized[3]['text'] == 'Together' and normalized[3]['singer']['kind'] == 'group'
    assert ls.normalize_vocal_markers(normalized) == normalized


def test_singer_labels_use_short_names_in_new_and_previously_saved_assignments():
    lines = ls.normalize_vocal_markers([
        {'time': 1, 'text': '男：First'}, {'time': 2, 'text': '女：Reply'},
        {'time': 3, 'text': 'Saved', 'singer': {'id': 'lrc-male', 'kind': 'person', 'slot': 1, 'name': '男聲'}},
    ])
    assert [line['singer']['name'] for line in lines] == ['男', '女', '男']
