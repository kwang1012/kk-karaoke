"""Singing together: a room's lobby and session, kept as plain state so it can be tested without sockets.

A session goes lobby -> playing <-> paused -> gone. The server names every start time (a lobby start counts down first),
so each device plays the song itself from the same moment on the server's clock; nothing about the sound crosses the
network. A member is one device's tab: two tabs of a browser are two members, as each one plays its own audio.
"""
from dataclasses import dataclass, field
from typing import Optional

# A lobby start counts 3-2-1 on every device, then a second to spare for the slowest to get ready.
COUNTDOWN_MS = 4000
RESUME_MS = 2000
RESTART_MS = 3000

STATUSES = ("loading", "ready", "locked", "out")  # locked: the browser keeps this device's audio shut until a tap
PARTS = (0, 1, 2)  # 0 sings both parts, 1 and 2 the first and second singer
MAX_MEMBERS = 12


@dataclass
class Member:
    id: str
    name: str
    avatar: str
    status: str = "loading"
    progress: float = 0.0
    part: int = 0

    def payload(self) -> dict:
        return {"id": self.id, "name": self.name, "avatar": self.avatar, "status": self.status,
                "progress": self.progress, "part": self.part}


@dataclass
class Session:
    track_id: str
    opener: str
    phase: str = "lobby"  # lobby | playing | paused
    members: dict[str, Member] = field(default_factory=dict)
    anchor_at: float = 0  # server ms at which the song is `anchor_from` seconds in; 0 outside a play
    anchor_from: float = 0
    position: float = 0  # where a pause left the song

    def payload(self) -> dict:
        return {"phase": self.phase, "trackId": self.track_id, "opener": self.opener,
                "members": [m.payload() for m in self.members.values()],
                "startAt": self.anchor_at, "from": self.anchor_from, "position": self.position}

    def active(self, member_id: str) -> bool:
        member = self.members.get(member_id)
        return member is not None and member.status != "out"


class DuetRegistry:
    def __init__(self) -> None:
        self.rooms: dict[str, Session] = {}

    def get(self, room: str) -> Optional[Session]:
        return self.rooms.get(room)

    def open(self, room: str, track_id: str, member: Member) -> Optional[Session]:
        """Opens a lobby for `track_id` with `member` as its opener. A running session is left alone."""
        if not track_id or not member.id:
            return None
        current = self.rooms.get(room)
        if current and current.phase != "lobby":
            return None
        member.status = "loading"
        self.rooms[room] = Session(track_id=track_id, opener=member.id, members={member.id: member})
        return self.rooms[room]

    def report(self, room: str, member: Member, status: Optional[str] = None, progress: Optional[float] = None,
               part: Optional[int] = None) -> Optional[Session]:
        """A device says how it stands: loading its song, ready, waiting for a tap, or sitting this one out."""
        session = self.rooms.get(room)
        if not session or not member.id:
            return None
        known = session.members.get(member.id)
        if known is None:
            if len(session.members) >= MAX_MEMBERS:
                return None
            known = session.members[member.id] = member
        known.name, known.avatar = member.name, member.avatar  # a renamed person stays current
        if status in STATUSES:
            known.status = status
        if isinstance(progress, (int, float)) and 0 <= progress <= 1:
            known.progress = float(progress)
        if part in PARTS:
            known.part = part
        return session

    def drop(self, room: str, member_id: str) -> Optional[Session]:
        """A device left. Its session goes with the last one, and the next member takes over the opener's place."""
        session = self.rooms.get(room)
        if not session or member_id not in session.members:
            return session
        del session.members[member_id]
        if not session.members:
            del self.rooms[room]
            return None
        if session.opener == member_id:
            session.opener = next(iter(session.members))
        return session

    def begin(self, room: str, member_id: str, now_ms: float) -> Optional[Session]:
        """The opener starts the song: those sitting it out are left behind, everyone else counts down."""
        session = self.rooms.get(room)
        if not session or session.phase != "lobby" or session.opener != member_id:
            return None
        session.members = {k: m for k, m in session.members.items() if m.status != "out"}
        session.phase = "playing"
        session.anchor_from = 0
        session.anchor_at = now_ms + COUNTDOWN_MS
        return session

    def start_now(self, room: str, track_id: str, member: Member, from_: float, now_ms: float, lead_ms: float) -> Session:
        """A start with no lobby (an older app, or a script): the sender is the whole session."""
        member.status = "ready"
        session = Session(track_id=track_id, opener=member.id, phase="playing", members={member.id: member},
                          anchor_from=from_, anchor_at=now_ms + lead_ms)
        self.rooms[room] = session
        return session

    def pause(self, room: str, member_id: str, now_ms: float) -> Optional[Session]:
        session = self.rooms.get(room)
        if not session or session.phase != "playing" or not session.active(member_id):
            return None
        session.position = session.anchor_from + max(0.0, now_ms - session.anchor_at) / 1000
        session.phase = "paused"
        session.anchor_at = 0
        return session

    def resume(self, room: str, member_id: str, now_ms: float) -> Optional[Session]:
        session = self.rooms.get(room)
        if not session or session.phase != "paused" or not session.active(member_id):
            return None
        session.phase = "playing"
        session.anchor_from = session.position
        session.anchor_at = now_ms + RESUME_MS
        return session

    def restart(self, room: str, member_id: str, now_ms: float) -> Optional[Session]:
        session = self.rooms.get(room)
        if not session or session.phase == "lobby" or not session.active(member_id):
            return None
        session.phase = "playing"
        session.anchor_from = 0
        session.anchor_at = now_ms + RESTART_MS
        return session

    def end(self, room: str) -> bool:
        return self.rooms.pop(room, None) is not None
