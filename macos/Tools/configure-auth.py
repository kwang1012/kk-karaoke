"""Bundle only the web client's public Supabase settings; never server credentials."""
import os
import base64
import json
from pathlib import Path
import plistlib

repo = Path(__file__).resolve().parents[2]
mode = os.environ.get('KARAOKE_AUTH_MODE', 'production')
values = {}
allowed = ('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY')
for name in ('.env', '.env.local', f'.env.{mode}', f'.env.{mode}.local'):
    path = repo / 'frontend' / name
    if not path.exists():
        continue
    for line in path.read_text().splitlines():
        key, sep, value = line.strip().removeprefix('export ').partition('=')
        if sep and key.strip() in allowed:
            value = value.strip()
            if value[:1] in ('"', "'") and value[-1:] == value[:1]:
                value = value[1:-1]
            else:
                value = value.split(' #', 1)[0].strip()
            values[key.strip()] = value
for key in allowed:
    if key in os.environ:
        values[key] = os.environ[key]
key = values.get('VITE_SUPABASE_ANON_KEY', '')
if key:
    anon = False
    try:
        payload = key.split('.')[1]
        anon = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role') == 'anon'
    except (IndexError, ValueError):
        pass
    if not (key.startswith('sb_publishable_') or anon):
        raise SystemExit('Host sign-in requires a public Supabase publishable or anon key; privileged keys must not be bundled.')
output = Path(os.environ['TARGET_BUILD_DIR']) / os.environ['UNLOCALIZED_RESOURCES_FOLDER_PATH'] / 'HostAuth.plist'
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('wb') as file:
    plistlib.dump({'url': values.get(allowed[0], ''), 'publicKey': values.get(allowed[1], '')}, file)
