// GENERATED FILE — do not edit by hand.
// Source: backoffice/universal-platform/scripts/app-marks/marks.mjs
// Regenerate: node scripts/app-marks/build.mjs (from backoffice/universal-platform)
// Mark: Universal Invoices — A torn-off receipt: the items, then the total.
// Hover: The total adds itself up.
//
// Icon-only by design: the SDK's UniversalAppsNavBar renders the product name
// from its catalogue beside this slot, so a wordmark here would print it twice.

const CSS = `
  /* Resting states */
  .uam-invoices-total { transform: scaleX(0.5); transition: transform .5s cubic-bezier(0.16,1,0.3,1); transform-origin: left center; transform-box: fill-box; }

  /* Active states */
  .uam-host-invoices:hover .uam-invoices-total,
  .uam-host-invoices:focus-visible .uam-invoices-total { transform: scaleX(1); }

  @media (prefers-reduced-motion: reduce) {
    .uam-invoices-total { transition: none !important; }
  }
`

export default function ProductLogo() {
  return (
    <span
      className="uam-host-invoices inline-flex h-6 w-6 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden="true">
        <defs>
          <linearGradient id="uam-nav-invoices-tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fe8c01" />
            <stop offset="1" stopColor="#e05504" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#uam-nav-invoices-tile)" />
        <polygon points="13,6 51,6 51,56 46.25,51.5 41.5,56 36.75,51.5 32,56 27.25,51.5 22.5,56 17.75,51.5 13,56" fill="#ffffff" />
        <rect x={19} y={13} width={26} height={4} rx={2} fill="#fdba74" />
        <rect x={19} y={21} width={18} height={4} rx={2} fill="#fdba74" />
        <rect x={19} y={29} width={22} height={4} rx={2} fill="#fdba74" />
        <rect x={19} y={38} width={26} height={6.5} rx={2} fill="#e05504" className="uam-invoices-total" />
      </svg>
    </span>
  )
}
