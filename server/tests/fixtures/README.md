# IndianAPI fixtures

These fixtures are generated from authenticated live responses by:

```sh
pnpm market:verify -- reliance
```

The verifier keeps only fields required by StockFolio and never writes the API
key, request headers, or complete upstream payloads. Do not replace these files
with invented sample data: fixture generation is successful only after the
search, detail, and historical-data endpoints all pass validation.

