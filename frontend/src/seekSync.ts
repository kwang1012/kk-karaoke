// Keep an optimistic remote seek until the audio owner acknowledges that request.
// Other playback updates (volume, play/pause, etc.) can still flow normally.
export class SeekSync {
  private pending = new Map<string, { id: string; expires: number }>();
  private sequence = 0;
  private clientId = Math.random().toString(36).slice(2);

  begin(roomId: string, now = Date.now()) {
    const id = `${this.clientId}-${now}-${++this.sequence}`;
    this.pending.set(roomId, { id, expires: now + 10_000 });
    return id;
  }

  accepts(roomId: string, requestId?: string, now = Date.now()) {
    const pending = this.pending.get(roomId);
    if (!pending) return true;
    if (now >= pending.expires || requestId === pending.id) {
      this.pending.delete(roomId);
      return true;
    }
    return false;
  }

  // A control echo isn't an acknowledgement that the owner has applied it.
  acceptsControl(roomId: string, requestId?: string, now = Date.now()) {
    const pending = this.pending.get(roomId);
    return !pending || now >= pending.expires || requestId === pending.id;
  }

  clear(roomId: string) { this.pending.delete(roomId); }
}

export const seekSync = new SeekSync();
