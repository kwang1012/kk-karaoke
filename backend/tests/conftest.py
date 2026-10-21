import pytest


@pytest.fixture(autouse=True)
def catalog_db(monkeypatch, tmp_path_factory):
    """Execute the production SQL against isolated SQLite; never query the live D1 catalog."""
    import sqlite3
    from pathlib import Path
    from managers import catalog, r2

    isolated = tmp_path_factory.mktemp("catalog")
    database = isolated / "catalog.sqlite3"
    schema = Path(__file__).parents[1] / "migrations/0001_catalog.sql"
    with sqlite3.connect(database) as connection:
        connection.executescript(schema.read_text())

    def execute(sql, params=()):
        with sqlite3.connect(database, timeout=10) as connection:
            connection.row_factory = sqlite3.Row
            if "CREATE TABLE IF NOT EXISTS songs" in sql:
                connection.executescript(sql)
                return []
            return [dict(row) for row in connection.execute(sql, params).fetchall()]

    catalog.invalidate_lists()
    monkeypatch.setattr(catalog, "execute", execute)
    def execute_batch(statements):
        with sqlite3.connect(database, timeout=10) as connection:
            connection.row_factory = sqlite3.Row
            return [{"success": True, "results": [dict(r) for r in connection.execute(sql, params).fetchall()]}
                    for sql, params in statements]
    monkeypatch.setattr(catalog, "execute_batch", execute_batch)
    monkeypatch.setattr(r2, "DATA_DIR", str(isolated / "data"))
    kinds = []
    for prefix, _, ext in r2.KINDS:
        directory = isolated / "cache" / ("lyrics" if prefix.startswith("lyrics") else prefix)
        directory.mkdir(parents=True, exist_ok=True)
        kinds.append((prefix, str(directory), ext))
    monkeypatch.setattr(r2, "KINDS", tuple(kinds))
    monkeypatch.setattr(r2, "LYRICS_DIR", str(isolated / "cache/lyrics"))
    return execute


@pytest.fixture(autouse=True)
def no_bucket(monkeypatch):
    """A test must never touch the real bucket: with R2 configured in .env, writes would be uploaded to it."""
    monkeypatch.setattr("managers.r2.enabled", lambda: False)


@pytest.fixture(autouse=True)
def no_word_providers(monkeypatch):
    """The word-level providers are real web services: a test that wants one says so."""
    monkeypatch.setattr("services.providers.find_word_entry", lambda *a, **k: None)


@pytest.fixture(autouse=True)
def no_spotify(monkeypatch):
    """Spotify search needs the developer's credentials from .env: tests never use them."""
    monkeypatch.setattr("services.providers.spotify_entries", lambda *a, **k: [])


@pytest.fixture(autouse=True)
def no_binimum(monkeypatch):
    monkeypatch.setattr("services.providers.binimum_entries", lambda *a, **k: [])


@pytest.fixture(autouse=True)
def no_unison(monkeypatch):
    monkeypatch.setattr("services.providers.unison_entries", lambda *a, **k: [])
    monkeypatch.setattr("services.providers.unison_for_video", lambda *a, **k: None)
