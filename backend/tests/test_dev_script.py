"""Exercise dev.sh's real process-group shutdown with lightweight fake services."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

import pytest


@pytest.mark.parametrize("worker_mode", ["normal", "stopped", "stubborn"])
def test_ctrl_c_stops_all_services(tmp_path, worker_mode):
    root = Path(__file__).resolve().parents[2]
    shutil.copy(root / "dev.sh", tmp_path / "dev.sh")
    (tmp_path / "backend").mkdir()
    (tmp_path / "frontend" / "node_modules").mkdir(parents=True)
    commands = tmp_path / "bin"
    commands.mkdir()
    service = '''#!/bin/bash
kind=frontend
case "$*" in
  *uvicorn*) kind=api ;;
  *celery*) kind=worker ;;
esac
echo $$ >"$TEST_TASK_DIR/$kind.pid"
trap 'exit 0' TERM
if [ "$kind" = worker ]; then
  case "$TEST_WORKER_MODE" in
    stopped) kill -STOP $$ ;;
    stubborn) trap '' TERM ;;
  esac
fi
while :; do sleep 0.2; done
'''
    for name, content in {
        "uv": service, "yarn": service,
        "ffmpeg": "#!/bin/sh\nexit 0\n",
        "redis-cli": "#!/bin/sh\nexit 0\n",
        "lsof": "#!/bin/sh\nexit 1\n",
    }.items():
        path = commands / name
        path.write_text(content)
        path.chmod(0o755)
    env = dict(os.environ, PATH=f"{commands}:/usr/bin:/bin", TEST_TASK_DIR=str(tmp_path), TEST_WORKER_MODE=worker_mode)
    process = subprocess.Popen(["/bin/bash", str(tmp_path / "dev.sh")], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    service_pids = []
    try:
        deadline = time.monotonic() + 5
        while len(list(tmp_path.glob("*.pid"))) < 3 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert len(list(tmp_path.glob("*.pid"))) == 3
        service_pids = [int(p.read_text()) for p in tmp_path.glob("*.pid")]
        process.send_signal(signal.SIGINT)
        output, _ = process.communicate(timeout=8)
        assert process.returncode == 130, output.decode()
        for pid in service_pids:
            with pytest.raises(ProcessLookupError):
                os.kill(pid, 0)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        for pid in service_pids:
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
