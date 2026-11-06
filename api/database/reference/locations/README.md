# Location Reference Data

Pinned reference data for Arc's Location Reference Data. No runtime code reads an external provider; these files are the import source.

## Files

| File | Contents |
| --- | --- |
| `countries.json` | 250 countries: `code`, `name` |
| `administrative-areas.json` | 3,863 first-level areas: `code`, `country_code`, `name`, `type` |
| `postal-code-requiredness.json` | 250 countries: boolean, derived from libaddressinput `require` metadata |
| `address-rule-overrides.json` | Arc deltas over `lib-address/lite` address fields: `country_code`, `rules` |

## Sources

### Countries and Administrative Areas

- Project: `dr5hn/countries-states-cities-database`
- Release: `v5.2.0-export.1`
- Commit: `9b255c45fc53e02a8dff547d88558d4fe91784d5`
- Source files: `json/countries.json`, `json/states.json`
- Import rule: all countries; only `level = 1` subdivisions; exclude `VN`.
- Checksums:
  - `countries.json`: `a438b0e16eda601c300badd9b50e90f7f5398e25db6acd6050dc9069a46335de`
  - `administrative-areas.json`: `ff69560db31b4c2a955d7789e05723bfeab1675adddc125e5d70c1b2d6531edc`

Subdivision code is `iso3166_2` when present, otherwise `<country_code>-<iso2>`. Fourteen level-1 records lack an ISO 3166-2 code and use the fallback.

### Vietnam Override

- Project: `open-admin-data/vietnam-administrative-divisions`
- Commit: `54cdb052284b02e75dfaa44089ca383aa12c57db`
- Source file: `data/all-province.json`
- Basis: Decision 19/2025/QĐ-TTg, effective 1 July 2025.
- Import rule: replace dr5hn's `VN` level-1 rows with the 34 official provincial units.
- Code format: `VN-<official numeric id>`.
- Name: English name from `name.en`.

### Postal Requiredness

- Source: Google libaddressinput address metadata, `https://chromium-i18n.appspot.com/ssl-address/data/<CC>`.
- Retrieved: 2026-11-05.
- Rule: a country requires a postcode when its `require` string contains `Z`; missing metadata uses the `ZZ` default, whose `require` string is `AC` and therefore does not require a postcode.
- Derived checksum: `256a26a555c8a42037fafe28c0839ee92a37002ea5d48f70ef777361441b7cd5`.

The derived map is committed so seeding and deployment never call the provider.

### Address Rule Overrides

`address-rule-overrides.json` stores only Arc-owned deltas on top of the
`lib-address/lite` country metadata used by the API. The seed upserts these
rows into `country_address_rules` and deletes rows that disappear from the
file. Merged rules are generated per request, so the table never holds the
full generated rule set. Supported keys:

- `order`: optional field-key order for countries whose local-script format
  differs from the lite Latin format (for example `JP`).
- `labels`: field-key label overrides.
- `hidden`: fields rendered with `visible: false`; only `subdivision` and
  `zip` may be hidden because every other contract field must stay on the
  form.

The file participates in the dataset checksum, so changing it produces a new
dataset version.

## Attribution

See `NOTICE.md`. Keep the notices with these files when redistributing the data.
