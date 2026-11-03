# Universal Invoices

**Quotes, pro formas, invoices and delivery notes as clean PDFs. No account, nothing uploaded.**

Set up your company once — logo, address, bank details, legal footer — keep a
catalogue of what you sell and a list of who you sell to, and make a numbered
document in a few clicks. The PDF is drawn in your browser and previewed live
beside the form. Each document shows its **journey** — estimate, quote, pro
forma, invoice, delivery note — and the next step is made from it in a click,
every line carried across under a new number.

Part of the [Universal Apps](https://opensource.unisim.co.uk) suite, at
<https://opensource.unisim.co.uk/invoices>.

## What it does

- **Five kinds of document:** estimate, quote, pro forma, invoice, delivery note
  (no prices, a "received by" box). Documents has a sidebar of the five, with a
  count each; pick one to see only those, and the New button makes that kind.
  On All, **New document** opens the five with a line on what each is for.
  Double-tap a kind to make Documents open on it.
- **The editor:** each section (From, Document, Client, Lines, Terms and
  notes) folds away, and keeps its edits until its own **Save** (or
  ⌘/Ctrl+S) — then the preview redraws; Download saves first. Hover a
  section, or type in it, and the preview marks and scrolls to the part of
  the PDF it fills in. The notes print as a full-width box under the totals.
- **The journey:** above every document, its five steps from estimate to
  delivery note. A step is made here (*Make the invoice here*, which asks
  whether to base it on the step before — lines, prices, terms — or start
  fresh with only the client), or — when it was done somewhere else —
  uploaded (a PDF or a picture, kept with it), ticked *Done elsewhere*, or
  marked *Not needed*. There are no statuses to keep up: this is not
  accounting software.
- **Import PDF:** a quote, estimate, invoice or delivery note made somewhere
  else is read into a document you can edit — number, dates, client, lines,
  units, prices, notes, terms and bank details — with the PDF kept beside it.
  Until you tick *Checked — it matches* it shows the PDF's total against what
  the lines read come to, and making another document from it asks first.
  Read in your browser; a scan with no text cannot be read. A PDF's pictures
  are not read back: a line takes the picture of the catalogue item with its
  code, and any line's picture box offers Upload or one from your catalogue.
- **A link to each document:** signed in, *Share* (and every *Download PDF*)
  gives the document a link to its PDF, kept on your Universal ID and updated
  as you edit. It is **private** — it opens only for you, signed in — until
  you tick *Anyone with the link can open it*; *Stop sharing* deletes it, and
  so does deleting the document.
- **Numbering per company per kind**, from a pattern: `DEV-{YYYY}{MM}{DD}-{N:5}`
  → `DEV-20260727-00406`.
- **Lines from your catalogue** (code, description, unit, catalogue price, a
  picture), or typed in.
- **Discounts** on a line (per unit) or on the whole document, typed as `10%`
  or as an amount. A discounted line prints the catalogue price struck through
  above the discounted one; a document discount shows as Subtotal → Discount,
  and VAT is charged on what is left.
- **Clients:** a customer name, and optionally an address, client number and
  the contact person — name, role and email, printed "Attn: name, role" under
  the address.
- **Tax:** no VAT for an export, with the exemption wording printed; reverse
  charge; or VAT per line, totalled per rate.
- **English or French documents**, independent of how numbers are written
  (`163 000 €` or `€163,000`). Euro, pound and dollar.
- **More than one company** if you trade under more than one name. One is
  **active** — new documents come from it, so there is no company to pick on
  each one. Documents shows one company's documents at a time: its Company
  dropdown switches the active company (as Your companies does).
- **Duplicate** a company, client or catalogue item to start a new one from it
  — or tick documents in the list and Duplicate them: a copy with a new number.
- **A catalogue that fills fast:** add several products at once in rows (a new
  row appears as you type in the last), drop a picture on a product to set it,
  or drop many pictures on the Catalogue tab to make one product each, coded by
  the file name.
- **Arrange the catalogue:** drag products by their handle into the order you
  want (a mouse, a finger or the ↑ ↓ keys), make folders and drag products into
  them — tick several and drag one to move them all. "Add from catalogue" on a
  document follows the same order, grouped by folder; the spreadsheet has a
  Folder column.
- **Tabs in your order:** drag a tab along the bar (on a phone, hold it first),
  or use Tune this app → Tab order. It follows your account when signed in.
- **Spreadsheets in and out:** export one item, a selection or everything to an
  `.xlsx` workbook (Companies, Clients, Catalogue, Documents, Lines, plus a Read
  me sheet) — a company brings its documents, a document brings its company,
  client and catalogue items. Pictures stay out; the backup has them.
- **Back up everything** to one JSON file, and restore it on another device.
  One **Import…** takes either a backup or a spreadsheet, tells you what it
  will add and update, and asks first — importing merges, it never deletes.

## Privacy

No account is needed. Signed out, there is no server for your documents: your
companies, clients, catalogue and documents live in this browser's IndexedDB,
and the PDF is made on your device. Clearing the site's data deletes them —
back up from Advanced.

Signing in with a Universal ID is optional. It brings your Tuning and lets you
name the app ("Bradley's Invoices", the product's name, or your own) in Tune
this app; that choice and your Call me name are kept on your Universal ID. If
your Universal ID belongs to a company, that company appears in Your companies
as the default "From", and its Business details from app.unisim.co.uk
(address, VAT and registration numbers, bank details, logo, footer) are read
into this browser and kept in step with the hub — those fields show a Synced chip
and are changed on the hub, not here. Delete it and it stays gone until you
choose "Add it back". Documents you have already made keep the details they
were made with. A spreadsheet export is a file on your device only.

**Online backup, signed in.** While you are signed in, a copy of your
companies, clients, catalogue and documents (pictures included) is kept on your
Universal ID, so your other devices get them too: a few seconds after each
change it is uploaded as one compressed file, and another device signed in to
the same Universal ID merges it in — the newer edit wins, and deletions travel.
It is protected by your account, like the rest of your Universal ID, but it is
not end-to-end encrypted. The limit is 10 MB (50 MB for organisations on
Enterprise); past it the backup pauses and says so. Advanced → "Online backup
is on" turns it off and deletes the copy; this browser keeps everything.
Deleting your Universal ID deletes the copy.

**Each account its own.** In one browser, each Universal ID keeps its own
companies, clients, catalogue and documents, and signed out keeps another set:
signing in to a second account never mixes the first one's in. The first time
a new account with no online copy is used, what you made here signed out is
copied into it.

**Share links.** A document's link holds its PDF on your Universal ID, read
back only through a check that it is shared or yours. Private until you share
it; stopping sharing, or deleting the document, deletes the copy.

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
npm test           # Vitest: numbering, money input, conversion, backups, spreadsheets
npm run build
```

## Licence

[AGPL-3.0-or-later](LICENSE), with an added permission for app-store
distribution. Use it, change it, share it — and if you run a changed copy and
let other people use it over a network, offer them your source. Contributions:
see [CONTRIBUTING.md](CONTRIBUTING.md).
