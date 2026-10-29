# Universal Invoices

**Quotes, pro formas, invoices and delivery notes as clean PDFs. No account, nothing uploaded.**

Set up your company once — logo, address, bank details, legal footer — keep a
catalogue of what you sell and a list of who you sell to, and make a numbered
document in a few clicks. The PDF is drawn in your browser and previewed live
beside the form. When a quote is accepted, *Make… → Invoice from this* carries
every line across under a new number.

Part of the [Universal Apps](https://opensource.unisim.co.uk) suite, at
<https://opensource.unisim.co.uk/invoices>.

## What it does

- **Five kinds of document:** quote, estimate, pro forma, invoice, delivery note
  (no prices, a "received by" box).
- **Numbering per company per kind**, from a pattern: `DEV-{YYYY}{MM}{DD}-{N:5}`
  → `DEV-20260727-00406`.
- **Lines from your catalogue** (code, description, unit, price, a struck-through
  list price for a discount, a picture), or typed in.
- **Tax:** no VAT for an export, with the exemption wording printed; reverse
  charge; or VAT per line, totalled per rate.
- **English or French documents**, independent of how numbers are written
  (`163 000 €` or `€163,000`). Euro, pound and dollar.
- **More than one company** if you trade under more than one name.
- **Back up everything** to one JSON file, and restore it on another device —
  restoring merges, it never deletes.

## Privacy

There is no account and no server. Your companies, clients, catalogue and
documents live in this browser's IndexedDB, and the PDF is made on your device.
Clearing the site's data deletes them — back up from the menu.

## How it is built

Vite + React 18 + Tailwind 4, a PWA, on a Cloudflare Worker serving static
assets only. The PDF engine is `@unisim/doc`'s business-document module
(fixed-layout A4 on its own dependency-free PDF writer, totals in integer
cents), shared with the rest of the suite rather than copied into this repo.
Its layout was measured off a real Sellsy estimate and its self-tests hold every
landmark to it.

```
npm install
npm run dev        # or scripts/preview.ps1 / preview.sh — port 5213
npm test           # Vitest: numbering, money input, conversion, backups
npm run build
```

## Licence

[AGPL-3.0-or-later](LICENSE), with an added permission for app-store
distribution. Use it, change it, share it — and if you run a changed copy and
let other people use it over a network, offer them your source. Contributions:
see [CONTRIBUTING.md](CONTRIBUTING.md).
