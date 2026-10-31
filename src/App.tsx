import { useEffect } from 'react';
import { DefaultViewSelect, UniversalAppsNavBar, UpdateNotice, useDefaultView, useUserPrefs } from '@unisim/sdk';
import ProductLogo from './components/Header/ProductLogo';
import AppMenu from './components/Header/AppMenu';
import CatalogueView from './components/CatalogueView';
import ClientsView from './components/ClientsView';
import CompaniesView from './components/CompaniesView';
import DocumentEditor from './components/DocumentEditor';
import DocumentsView from './components/DocumentsView';
import TabBar from './components/TabBar';
import TabOrderPreference from './components/TabOrderPreference';
import { normaliseOrder, TAB_VALUES, TABS } from './lib/tabs';
import { OrgSync } from './components/OrgSync';
import CloudBackup from './components/CloudBackup';
import { cloudFooter } from './components/cloudText';
import { useAppStore, type Tab } from './stores/appStore';
import { useThemeStore } from './stores/themeStore';

// The page container, shared with the navbar via `contentClassName` so the
// suite switcher lines up with the content's left edge at every breakpoint.
// Wider than the suite's usual max-w-7xl: the document editor is a form AND a
// full-height PDF side by side, and both need the room.
export const CONTAINER = 'gutter mx-auto w-full max-w-[96rem]';

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Invoices';

export default function App() {
  const { init, loaded, tab, setTab, openId, documents, notice, dismissNotice } = useAppStore();
  const cloudLine = cloudFooter(useAppStore((s) => s.cloud));
  const homeTab = useDefaultView<Tab>('home-tab', 'documents', { views: TAB_VALUES });
  const openDoc = openId ? documents.find((d) => d.id === openId) : undefined;
  // Here, in a component that is always mounted, so a change made in Tune
  // this app still reaches the account after the dialog shuts.
  const { pref, setPref } = useUserPrefs();
  const tabOrder = normaliseOrder(pref<unknown>('tabOrder', null));
  const setTabOrder = (order: Tab[]) => setPref('tabOrder', order);

  useEffect(() => {
    void init().then(() => setTab(homeTab.defaultView));
    // Once, on load: the home tab is where the app OPENS, not where it stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <UniversalAppsNavBar
        contentClassName={CONTAINER}
        product="invoices"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        themeStore={useThemeStore}
        appPreferences={
          <>
            <DefaultViewSelect id="home-tab" label="Opens on" fallback="documents" views={TABS} />
            <TabOrderPreference order={tabOrder} onOrder={setTabOrder} />
          </>
        }
        // The SDK resets its own (Opens on, theme, language); the tab order is ours.
        onResetDefaults={() => setPref('tabOrder', null)}
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
        // Signed in, the bar says whose it is — "Bradley’s Invoices" — and Tune
        // this app gets the account area, where App name keeps that, goes back
        // to "Universal Invoices" or takes a name they type (SDK 0.212.0).
        personalTitle={(name) => (name ? `${name}’s Invoices` : 'My Invoices')}
      />
      <div className={`${CONTAINER} pt-4`}>
        <UpdateNotice />
        {/* Keeps the Universal ID company in Your companies, live. */}
        <OrgSync />
        {/* Signed in: a copy on the Universal ID, kept up to date. */}
        <CloudBackup />
      </div>

      <main className={`${CONTAINER} flex-1 py-4 sm:py-6`}>
        {notice && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
            <p>{notice}</p>
            <button type="button" onClick={dismissNotice} className="font-semibold" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {!openDoc && (
          // A double tap on a tab makes it the one the app opens on (the suite
          // rule); "Opens on" in Tune this app is the same choice for anybody
          // who cannot double-tap, and Reset to defaults clears it. A drag
          // moves a tab (TabBar).
          <TabBar order={tabOrder} onOrder={setTabOrder} tab={tab} onTab={setTab} homeTab={homeTab} />
        )}

        {!loaded ? null : openDoc ? (
          <DocumentEditor key={openDoc.id} doc={openDoc} />
        ) : tab === 'documents' ? (
          <DocumentsView />
        ) : tab === 'clients' ? (
          <ClientsView />
        ) : tab === 'catalogue' ? (
          <CatalogueView />
        ) : (
          <CompaniesView />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400`}>
          <p>Quotes, pro formas, invoices and delivery notes. {cloudLine ?? 'Everything stays in this browser — back it up from the menu.'}</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-200">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Open source (AGPL)
          </a>
        </div>
      </footer>
    </div>
  );
}
