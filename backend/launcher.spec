# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

def collect_storage_data(base_folder):
    datas = []
    for root, _, files in os.walk(base_folder):
        rel_root = os.path.relpath(root, base_folder)
        for f in files:
            abs_path = os.path.join(root, f)
            dest_path = os.path.join('storage', rel_root)
            datas.append((abs_path, dest_path))
    return datas
redis_data = [
    ('bin/redis-server', '.'),
]
datas = collect_data_files('cutlet') + collect_data_files('unidic_lite') + collect_storage_data('storage') + redis_data
a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=['app', 'celery', 'celery.fixups', 'celery.fixups.django', 'celery.app.amqp', 'celery.loaders.app'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='launcher',
    debug=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='launcher',
)
