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

# Compare against the previous capture and publish the report. Runs even when
# a service is down: a capture of a degraded system is exactly the capture whose
# comparison somebody needs to read.
echo
node scripts/diff-snapshots.mjs
dif=$?

# Surface the inventory's data-quality signal without hiding it.
if [ "$rc" -eq 3 ]; then
  echo
  echo "note: the inventory reported hunts it could not map (exit 3)."
fi

# The differ exits 4 when an endpoint that used to answer no longer does. That
# outranks everything else here, because it is the one result that needs a
# person today.
if [ "$dif" -eq 4 ]; then exit 4; fi
exit "$svc"
