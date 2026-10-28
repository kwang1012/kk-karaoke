"""A sing-together session: lobby, ready check, a counted-down start, then pause, resume and restart for everyone."""
from services.duet import COUNTDOWN_MS, MAX_MEMBERS, RESTART_MS, RESUME_MS, DuetRegistry, Member


def member(id, name="kk"):
    return Member(id=id, name=name, avatar="/a.svg")


def lobby(*ids):
    registry = DuetRegistry()
    registry.open("r", "song", member(ids[0]))
    for id in ids[1:]:
        registry.report("r", member(id), status="ready")
    return registry


def test_a_lobby_has_its_opener_and_whoever_reports():
    registry = lobby("a", "b")
    session = registry.get("r")
    assert session.phase == "lobby" and session.opener == "a"
    assert [m.id for m in session.members.values()] == ["a", "b"]
    assert session.members["a"].status == "loading"  # the opener still has its song to load


def test_a_device_reports_how_it_stands():
    registry = lobby("a", "b")
    registry.report("r", member("b"), status="loading", progress=0.4, part=2)
    b = registry.get("r").members["b"]
    assert (b.status, b.progress, b.part) == ("loading", 0.4, 2)
    registry.report("r", member("b"), status="nonsense", progress=7, part=9)  # junk changes nothing
    assert (b.status, b.progress, b.part) == ("loading", 0.4, 2)


def test_a_report_with_no_lobby_is_ignored_and_the_lobby_is_capped():
    registry = DuetRegistry()
    assert registry.report("r", member("a"), status="ready") is None
    registry.open("r", "song", member("a"))
    for i in range(MAX_MEMBERS + 5):
        registry.report("r", member(f"m{i}"), status="ready")
    assert len(registry.get("r").members) == MAX_MEMBERS


def test_only_the_opener_starts_it_and_those_sitting_out_are_left_behind():
    registry = lobby("a", "b", "c")
    registry.report("r", member("c"), status="out")
    assert registry.begin("r", "b", 1000) is None  # not the opener
    session = registry.begin("r", "a", 1000)
    assert session.phase == "playing" and session.anchor_at == 1000 + COUNTDOWN_MS and session.anchor_from == 0
    assert sorted(session.members) == ["a", "b"]
    assert registry.begin("r", "a", 2000) is None  # already started


def test_a_running_session_is_not_replaced_by_a_new_lobby():
    registry = lobby("a")
    registry.begin("r", "a", 0)
    assert registry.open("r", "other", member("b")) is None
    assert registry.get("r").track_id == "song"


def test_pause_remembers_where_the_song_was_and_resume_counts_in_from_there():
    registry = lobby("a", "b")
    registry.begin("r", "a", 0)  # the song is 0 s in at 4000 ms
    paused = registry.pause("r", "b", 4000 + 12_500)  # anyone in it can pause
    assert paused.phase == "paused" and paused.position == 12.5 and paused.anchor_at == 0
    resumed = registry.resume("r", "a", 30_000)
    assert resumed.phase == "playing" and resumed.anchor_from == 12.5 and resumed.anchor_at == 30_000 + RESUME_MS


def test_pausing_during_the_countdown_leaves_the_song_at_the_start():
    registry = lobby("a")
    registry.begin("r", "a", 0)
    assert registry.pause("r", "a", 1000).position == 0  # the start was still 3 s away


def test_restart_goes_back_to_the_beginning_for_everyone_even_when_paused():
    registry = lobby("a", "b")
    registry.begin("r", "a", 0)
    registry.pause("r", "a", 60_000)
    restarted = registry.restart("r", "b", 70_000)
    assert restarted.phase == "playing" and restarted.anchor_from == 0 and restarted.anchor_at == 70_000 + RESTART_MS


def test_someone_who_sat_it_out_cannot_steer_the_song_and_a_lobby_cannot_be_paused():
    registry = lobby("a", "b")
    assert registry.pause("r", "a", 0) is None and registry.restart("r", "a", 0) is None  # still a lobby
    registry.report("r", member("b"), status="out")
    registry.begin("r", "a", 0)
    assert registry.pause("r", "b", 5000) is None  # dropped at the start


def test_when_the_opener_leaves_the_next_member_opens_and_the_last_one_ends_it():
    registry = lobby("a", "b")
    assert registry.drop("r", "a").opener == "b"
    assert registry.drop("r", "b") is None and registry.get("r") is None


def test_a_start_with_no_lobby_makes_the_sender_the_whole_session():
    registry = DuetRegistry()
    session = registry.start_now("r", "song", member("a"), 30, 1000, 3000)
    assert session.phase == "playing" and session.anchor_from == 30 and session.anchor_at == 4000
    assert registry.end("r") and not registry.end("r")
