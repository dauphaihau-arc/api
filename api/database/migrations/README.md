# Migrations

MikroORM may generate SQL strings as single-line literals. Do not keep them that way in this template.

Format migration SQL for readability:

- Use multi-line template literals for `this.addSql(...)` statements.
- Split `create table`, `alter table`, foreign keys, and indexes across multiple lines.
- Keep the SQL content unchanged when reformatting. This is a readability convention, not a schema change.

Use Migration20260508000100.ts as the reference format.