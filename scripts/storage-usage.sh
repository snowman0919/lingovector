#!/usr/bin/env bash
set -euo pipefail

storage_dir="${STORAGE_DIR:-./apps/api/storage}"
local_output_dir="${LOCAL_OUTPUT_DIR:-./local-output}"

echo "Lingovector storage usage"
echo

if [[ -d "$storage_dir" ]]; then
  echo "Runtime storage: $storage_dir"
  du -sh "$storage_dir"
  find "$storage_dir" -maxdepth 2 -type f | sed 's#^\./##' | sort | head -n 25
else
  echo "Runtime storage not found: $storage_dir"
fi

echo

if [[ -d "$local_output_dir" ]]; then
  echo "Local verification output: $local_output_dir"
  du -sh "$local_output_dir"
  find "$local_output_dir" -maxdepth 2 -type f | sed 's#^\./##' | sort | head -n 25
else
  echo "Local verification output not found: $local_output_dir"
fi
