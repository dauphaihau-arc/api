#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
agent_id="com.dauphaihau.api.local-seed-backup"
launch_agents_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agents_dir/$agent_id.plist"
logs_dir="$repo_root/.local-backups/logs"
stdout_log="$logs_dir/local-seed-backup.log"
stderr_log="$logs_dir/local-seed-backup.error.log"
backup_script="$repo_root/scripts/backup-local-seed-data.sh"
hour="${BACKUP_SCHEDULE_HOUR:-9}"
minute="${BACKUP_SCHEDULE_MINUTE:-0}"
keep_count="${BACKUP_KEEP_COUNT:-14}"

if ! [[ "$hour" =~ ^[0-9]+$ ]] || [ "$hour" -lt 0 ] || [ "$hour" -gt 23 ]; then
  echo "BACKUP_SCHEDULE_HOUR must be an integer between 0 and 23" >&2
  exit 1
fi

if ! [[ "$minute" =~ ^[0-9]+$ ]] || [ "$minute" -lt 0 ] || [ "$minute" -gt 59 ]; then
  echo "BACKUP_SCHEDULE_MINUTE must be an integer between 0 and 59" >&2
  exit 1
fi

mkdir -p "$launch_agents_dir" "$logs_dir"

cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$agent_id</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>BACKUP_KEEP_COUNT=$keep_count "$backup_script"</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$hour</integer>
    <key>Minute</key>
    <integer>$minute</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$stdout_log</string>
  <key>StandardErrorPath</key>
  <string>$stderr_log</string>
  <key>WorkingDirectory</key>
  <string>$repo_root</string>
</dict>
</plist>
PLIST

launchctl unload "$plist_path" >/dev/null 2>&1 || true
launchctl load "$plist_path"
launchctl kickstart -k "gui/$(id -u)/$agent_id"

echo "Installed launchd agent: $agent_id"
echo "Plist: $plist_path"
echo "Schedule: daily at $(printf '%02d:%02d' "$hour" "$minute")"
echo "Retention count: $keep_count"
echo "Stdout log: $stdout_log"
echo "Stderr log: $stderr_log"
