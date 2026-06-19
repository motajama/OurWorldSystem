# Atlas of Economic Complexity Raw Data

Place manually downloaded Atlas of Economic Complexity CSV files in this directory.

Download source files from:

```text
https://atlas.hks.harvard.edu/data-downloads/
```

Supported file names include:

- `country_complexity.csv`
- `country_product_exports.csv`
- `product_complexity.csv`

The importer also scans other `.csv` files in this directory and will use files whose headers contain recognizable country or location codes, years, and supported indicator columns.

Run:

```sh
npm run data:import:complexity
```

The importer reads local files only and writes:

```text
static/data/indicators/productive-complexity.latest.json
```

If no CSV files are present, the importer writes a valid placeholder output with `status: "no_source_file"` and zero records, then exits successfully. Missing Atlas files must not block local builds or CI.

Raw source files in this directory may be gitignored except this README. Keep source downloads and any license or terms notes with your local data review records.
