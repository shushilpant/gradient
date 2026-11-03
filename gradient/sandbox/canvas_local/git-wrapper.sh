#!/bin/sh
# Preserve Git's pinned commits while avoiding historical binary blobs during
# dependency clones. Checkout fetches the files actually needed by that commit.
if [ "$1" = "clone" ]; then
  shift
  exec /usr/bin/git clone --filter=blob:none "$@"
fi
exec /usr/bin/git "$@"
