let fallback: string | undefined;

/** Names this browser to the server. Tabs of one browser share it; a phone, a laptop and the Mac app each have their own. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('kk-device-id');
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('kk-device-id', id);
    }
    return id;
  } catch {
    return (fallback ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  }
}
