#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
seed_dir="$repo_root/seed-data"
backup_root="$repo_root/.local-backups/seed-data"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
archive_path="$backup_root/seed-data-local-$timestamp.tgz"
keep_count="${BACKUP_KEEP_COUNT:-14}"

mkdir -p "$backup_root"

declare -a paths=()

while IFS= read -r file; do
  paths+=("${file#$repo_root/}")
done < <(find "$seed_dir" -maxdepth 1 -type f -name '*.local.tsv' | sort)

while IFS= read -r dir; do
  paths+=("${dir#$repo_root/}")
done < <(find "$seed_dir/images" -maxdepth 1 -mindepth 1 -type d -name '*-local' 2>/dev/null | sort)

if [ "${#paths[@]}" -eq 0 ]; then
  echo "No local seed data found under seed-data/*.local.tsv or seed-data/images/*-local/" >&2
  exit 1
fi

tar -czf "$archive_path" -C "$repo_root" "${paths[@]}"

if [[ "$keep_count" =~ ^[0-9]+$ ]] && [ "$keep_count" -gt 0 ]; then
  backup_archives=()
  while IFS= read -r archive; do
    backup_archives+=("$archive")
  done < <(find "$backup_root" -maxdepth 1 -type f -name 'seed-data-local-*.tgz' | sort)
  if [ "${#backup_archives[@]}" -gt "$keep_count" ]; then
    delete_count="$((${#backup_archives[@]} - keep_count))"
    for old_archive in "${backup_archives[@]:0:$delete_count}"; do
      rm -f "$old_archive"
    done
  fi
fi

echo "Created backup: $archive_path"
echo "Included paths:"
printf ' - %s\n' "${paths[@]}"
echo "Retention count: $keep_count"
