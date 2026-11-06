# Location Reference Data Notices

## Countries, States, and Cities Database (dr5hn)

The country and first-level administrative-area data is derived from:

> Data by Countries States Cities Database
> https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0

Licensed under the Open Database License (ODbL) v1.0. Attribution is required. Derivative databases must be offered under the same license. See the upstream `LICENSE` and `NOTICE-SOURCES.txt` for the full terms and third-party source credits.

Upstream release used: `v5.2.0-export.1` at commit `9b255c45fc53e02a8dff547d88558d4fe91784d5`.

## Vietnam Administrative Divisions (open-admin-data)

The Vietnam override is derived from:

> Vietnam Administrative Divisions Dataset (CC-BY-4.0)
> https://github.com/open-admin-data/vietnam-administrative-divisions

Licensed under Creative Commons Attribution 4.0 International (CC-BY-4.0). Attribution is required.

Upstream commit used: `54cdb052284b02e75dfaa44089ca383aa12c57db`.

## Google libaddressinput metadata

Postal-code requiredness is derived from Google's open-source libaddressinput address metadata served at `https://chromium-i18n.appspot.com/ssl-address/data/<CC>`, retrieved 2026-11-05.

See the upstream project for its license and notices:
https://github.com/google/libaddressinput

The derived requiredness map is committed so Arc does not call the metadata service at runtime.
