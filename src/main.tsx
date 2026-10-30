import React from 'react';
import ReactDOM from 'react-dom/client';
import { UniversalProvider, UsageTracker } from '@unisim/sdk';
import App from './App';
import './index.css';

// `product` exists in all three places a product code must (migration 0317,
// the SDK's `ProductCode`, and `SuiteProductId` + the catalogue, SDK 0.208.0).
// Never `as unknown as ProductCode` — if the type fights you, the enum is
// missing a value and the fix is a migration, not a cast.
//
// Accounts ON (James, 2026-10-30): Invoices is a Business Admin app, and that
// family uses the welcoming pill ("Howdy James") with Sign in as the first
// row — signing in brings the company's details and branding in from the hub
// (My Company → Business details, platform 0318). Signing in is never
// required: documents, clients and the catalogue still live in this browser
// either way, and a backup file is how they move.
const universalConfig = {
  supabaseUrl: import.meta.env.VITE_PLATFORM_SUPABASE_URL || 'https://rygfxgalojojppxmhddo.supabase.co',
  supabaseAnonKey:
    import.meta.env.VITE_PLATFORM_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5Z2Z4Z2Fsb2pvanBweG1oZGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTY4MjUsImV4cCI6MjA5NDMzMjgyNX0.hLy_vt9vY_rdPKF3nL32yAuMCD604E3CH5VM7D7CaNE',
  product: 'invoices' as const,
  cookieDomain: import.meta.env.PROD ? '.unisim.co.uk' : undefined,
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UniversalProvider config={universalConfig}>
      <UsageTracker />
      <App />
    </UniversalProvider>
  </React.StrictMode>,
);
