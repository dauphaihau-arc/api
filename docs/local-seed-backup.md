# Local Seed Backup

This repo includes a local-only seed backup flow for macOS.

## Manual backup

Run:

```sh
scripts/backup-local-seed-data.sh
```

It archives:

- `seed-data/*.local.tsv`
- `seed-data/images/*-local/`

Archives are written to `.local-backups/seed-data/`.

By default, the script keeps the newest 14 archives. Override with:

```sh
BACKUP_KEEP_COUNT=30 scripts/backup-local-seed-data.sh
```

## Scheduled macOS backup

Install the user `launchd` job:

```sh
scripts/install-macos-seed-backup-launchd.sh
```

Default schedule:

- daily at `09:00`
- keep last `14` archives

Override the schedule during install:

```sh
BACKUP_SCHEDULE_HOUR=21 BACKUP_SCHEDULE_MINUTE=30 BACKUP_KEEP_COUNT=30 scripts/install-macos-seed-backup-launchd.sh
```

Logs:

- `.local-backups/logs/local-seed-backup.log`
- `.local-backups/logs/local-seed-backup.error.log`
