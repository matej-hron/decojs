#!/usr/bin/env bash
# Apply the Supabase stub and every migration to a throwaway Postgres in Docker, run 0004, 0005, 0008, 0006, 0009 and 0007 twice
# (idempotency), then the RLS assertions. 0008 is live before 0006; 0007 runs last because its test deletes user A. Usage: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="decotrail-rls-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16 >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && break; sleep 0.5; done
sleep 1
run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -X -t -o /dev/null "$@"; }
run < tests/stub.sql
for f in migrations/0001_dive_log.sql migrations/0002_logbook.sql migrations/0003_logbook_dismissed.sql \
         tests/seed_before_0004.sql migrations/0004_community.sql migrations/0004_community.sql; do
    echo "applying $f"
    run < "$f"
done
run < tests/0004_rls.sql
for f in tests/seed_before_0005.sql migrations/0005_share_link.sql migrations/0005_share_link.sql; do
    echo "applying $f"
    run < "$f"
done
run < tests/0005_share.sql
for f in migrations/0008_share_avatar_fix.sql migrations/0008_share_avatar_fix.sql; do
    echo "applying $f"
    run < "$f"
done
run < tests/0008_share_avatar.sql
for f in migrations/0006_sites_description.sql migrations/0006_sites_description.sql; do
    echo "applying $f"
    run < "$f"
done
run < tests/0006_sites_description.sql
echo "applying 0006 again on data"
run < migrations/0006_sites_description.sql
run < tests/0008_share_avatar.sql # 0006 keeps 0008's author_key
for f in migrations/0009_share_map.sql migrations/0009_share_map.sql; do
    echo "applying $f"
    run < "$f"
done
run < tests/0009_share_map.sql
# 0007 last: its test deletes user A at the end (cascade check).
echo "applying migrations/0007_profile_documents.sql"
run < migrations/0007_profile_documents.sql
# A project that auto-exposes tables would grant anon everything: running 0007 again must take it back.
echo "grant all on public.qualifications, public.medical_checks to anon;" | run
echo "applying migrations/0007_profile_documents.sql"
run < migrations/0007_profile_documents.sql
run < tests/0007_documents.sql
echo "ALL RLS TESTS PASSED"
