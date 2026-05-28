#!/usr/bin/env bash
set -euo pipefail

days="${DAYS:-7}"
local_output_dir="${LOCAL_OUTPUT_DIR:-./local-output}"
mode="${1:---dry-run}"

if [[ "$local_output_dir" != "./local-output" && "$local_output_dir" != "local-output" && "$local_output_dir" != */local-output ]]; then
  echo "Refusing to clean a path that does not end in local-output: $local_output_dir" >&2
  exit 1
fi

if [[ ! -d "$local_output_dir" ]]; then
  echo "No local output directory found: $local_output_dir"
  exit 0
fi

if [[ "$mode" == "--delete" ]]; then
  echo "Deleting files in $local_output_dir older than $days days."
  find "$local_output_dir" -type f -mtime +"$days" -print -delete
  find "$local_output_dir" -type d -empty -print -delete
else
  echo "Dry run: files in $local_output_dir older than $days days. Pass --delete to remove them."
  find "$local_output_dir" -type f -mtime +"$days" -print
fi
