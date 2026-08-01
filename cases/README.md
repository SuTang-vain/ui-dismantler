# Case Catalog

`catalog.json` is the canonical logical inventory for managed directories under `examples/`.

Do not move a historical case merely to match this directory. Update the catalog first, preserve frozen identities, and migrate physical paths only in an isolated change with all affected regressions passing.

Validate with:

```bash
npm run catalog:validate
```
