"""Provision schema/import explicitly: uv run python scripts/catalog_db.py init|import."""
import argparse
import sys
import uuid
from pathlib import Path
import httpx
from dotenv import set_key

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from managers import catalog
from services.catalog_import import import_storage


def setup():
    """Create/reuse the named catalog; persist only its non-secret ID in the existing env file."""
    from config import CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID
    if not (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN):
        raise catalog.CatalogUnavailable("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in backend/.env")
    try:
        uuid.UUID(D1_DATABASE_ID)
        database_id = D1_DATABASE_ID
    except ValueError:
        endpoint = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database"
        with httpx.Client(timeout=20, headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}) as client:
            response = client.get(endpoint, params={"name": "karaoke-catalog", "per_page": 100})
            response.raise_for_status()
            body = response.json()
            if not body.get("success"):
                raise catalog.CatalogUnavailable("Cannot list D1 databases; check token/account permissions")
            matches = [row for row in body["result"] if row["name"] == "karaoke-catalog"]
            if matches:
                database_id = matches[0]["uuid"]
            else:
                response = client.post(endpoint, json={"name": "karaoke-catalog", "primary_location_hint": "enam"})
                response.raise_for_status()
                body = response.json()
                if not body.get("success"):
                    raise catalog.CatalogUnavailable("Could not create D1 catalog")
                database_id = body["result"]["uuid"]
        set_key(str(Path(__file__).parents[1] / ".env"), "D1_DATABASE_ID", database_id)
        print("D1 catalog database selected; its ID was saved in backend/.env")
    catalog.D1_DATABASE_ID = database_id
    catalog.migrate()
    print("D1 catalog schema is ready")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("setup", "init", "import", "status"))
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--skip-redis", action="store_true")
    args = parser.parse_args()
    if args.command == "setup":
        setup()
    elif args.command == "init":
        catalog.migrate()
        print("D1 catalog schema is ready")
    elif args.command == "import":
        print(import_storage(remote=not args.local_only, redis_metadata=not args.skip_redis))
    else:
        records = catalog.records(fresh=True)
        print({"songs": len(records), "ready": len(catalog.ready_ids()),
               "assets": sum(len(r["assets"]) for r in records)})


if __name__ == "__main__":
    try:
        main()
    except (catalog.CatalogUnavailable, httpx.HTTPError) as exc:
        # Never print a request or its authorization headers.
        detail = str(exc) if isinstance(exc, catalog.CatalogUnavailable) else type(exc).__name__
        print(f"Catalog operation failed: {detail}", file=sys.stderr)
        sys.exit(1)
