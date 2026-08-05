# Shop Order Export Glossary

- **Order export**: A seller-initiated CSV download of shop orders.
- **Date range**: The selected time window for `created_at` filtering. Presets are converted to exact UTC timestamps by the seller app.
- **Timezone**: The timezone used to interpret date presets and custom calendar dates before conversion to UTC.
- **Column preset**: A named column selection. `default` uses the server-defined default export columns; `custom` uses seller-selected allowlisted columns.
- **Custom columns**: Export column IDs selected by the seller from the approved allowlist, including fields that may not be visible in the orders table.
- **Hidden fields**: Exportable order fields not shown as primary table columns, such as internal shop IDs or operational notes.
