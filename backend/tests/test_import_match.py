from routes import imports
from routes.imports import MatchRequest


def test_a_song_with_no_recording_is_reported_missing(monkeypatch):
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: None)
    assert imports.match_song(MatchRequest(title="x")) == {"track": None, "ready": False, "processing": False}


def test_a_ready_song_is_not_processed_again(monkeypatch):
    sent = []
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: {"id": "abcdefghijk", "name": "A", "artists": []})
    monkeypatch.setattr(imports.catalog, "is_ready", lambda track_id: True)
    monkeypatch.setattr(imports, "send_process_request", lambda track: sent.append(track))
    result = imports.match_song(MatchRequest(title="A", process=True))
    assert result["ready"] and not result["processing"] and not sent


def test_an_unprepared_song_is_sent_once_for_a_while(monkeypatch):
    sent = []
    imports._sent.clear()
    monkeypatch.setattr(imports.charts, "_resolve", lambda entry: {"id": "abcdefghijk", "name": "A", "artists": []})
    monkeypatch.setattr(imports.catalog, "is_ready", lambda track_id: False)
    monkeypatch.setattr(imports, "send_process_request", lambda track: sent.append(track))
    first = imports.match_song(MatchRequest(title="A", process=True))
    second = imports.match_song(MatchRequest(title="A", process=True))
    assert first["processing"] and not second["processing"] and len(sent) == 1
    assert not imports.match_song(MatchRequest(title="A", process=False))["processing"]
