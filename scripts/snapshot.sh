#!/usr/bin/env bash
# Take both captures: the hunt inventory and the shape of every service.
#
# build-inventory exits 3 when a hunt cannot be mapped. That is a data-quality
# report, not a failure, and chaining the two with && let it skip the service
# snapshot entirely — losing the capture that matters most on exactly the days
# something is wrong. Exit 3 is tolerated here; anything else still stops.
set -uo pipefail

node scripts/build-inventory.mjs "$@"
rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ]; then
  echo "build-inventory failed (exit $rc); skipping service snapshot" >&2
  exit "$rc"
fi

echo
node scripts/snapshot-services.mjs
svc=$?

# Surface the inventory's data-quality signal without hiding it.
if [ "$rc" -eq 3 ]; then
  echo
  echo "note: the inventory reported hunts it could not map (exit 3)."
fi
exit "$svc"
