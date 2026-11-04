import { useEffect, useRef, useState } from 'react';
import { DefaultViewSelect, UniversalAppsNavBar, UpdateNotice, useDefaultView, useUser, useUserPrefs } from '@unisim/sdk';
import ProductLogo from './components/Header/ProductLogo';
import AppMenu from './components/Header/AppMenu';
import CatalogueView from './components/CatalogueView';
import ClientsView from './components/ClientsView';
import CompaniesView from './components/CompaniesView';
import DocumentEditor from './components/DocumentEditor';
import DocumentsView from './components/DocumentsView';
import TabBar from './components/TabBar';
import TabOrderPreference from './components/TabOrderPreference';
import { DOCUMENTS_VIEWS, normaliseOrder, TAB_VALUES, TABS } from './lib/tabs';
import { OrgSync } from './components/OrgSync';
import CloudBackup from './components/CloudBackup';
import SharedDocument from './components/SharedDocument';
import Toast from './components/Toast';
import { ShareCleanup } from './components/ShareLink';
import { CompanyShareSync, SharedCompanyLanding } from './components/CompanyShare';
import { cloudFooter } from './components/cloudText';
import { useAppStore, type Tab } from './stores/appStore';
import { useThemeStore } from './stores/themeStore';

// The page container, shared with the navbar via `contentClassName` so the
// suite switcher lines up with the content's left edge at every breakpoint.
// Wider than the suite's usual max-w-7xl: the document editor is a form AND a
// full-height PDF side by side, and both need the room.
export const CONTAINER = 'gutter mx-auto w-full max-w-[96rem]';

const REPO_URL = 'https://github.com/universal-simulation-ltd/Universal_Invoices';

// A share link (ShareLink.tsx) opens the shared PDF instead of the app.
const SHARE_ID = new URLSearchParams(location.search).get('share');
// A company's link (CompanyShare.tsx) opens the page that adds it.
const COMPANY_LINK = new URLSearchParams(location.search).get('company');

export default function App() {
  const { init, loaded, tab, setTab, openId, documents, notice, dismissNotice } = useAppStore();
  const cloudLine = cloudFooter(useAppStore((s) => s.cloud));
  const homeTab = useDefaultView<Tab>('home-tab', 'documents', { views: TAB_VALUES });
  const openDoc = openId ? documents.find((d) => d.id === openId) : undefined;
  // Here, in a component that is always mounted, so a change made in Tune
  // this app still reaches the account after the dialog shuts.
  const { pref, setPref } = useUserPrefs();
  // The RESOLVED theme ('system' already turned into light or dark): the bar
  // and its dropdowns are inline-styled, so without it they stay light in a
  // dark app while AppMenu's rows go dark.
  const theme = useThemeStore((s) => s.effective);
  const tabOrder = normaliseOrder(pref<unknown>('tabOrder', null));
  const setTabOrder = (order: Tab[]) => setPref('tabOrder', order);

  // Each Universal ID has its own rows in this browser, and signed out has
  // its own (lib/store.ts): signing in, out or across loads that account's.
  const { user, loading } = useUser();
  const account = user && !(user as { is_anonymous?: boolean }).is_anonymous ? user.id : null;
  const opened = useRef(false);
  const [companyLink, setCompanyLink] = useState(COMPANY_LINK);
  // Done with the link: back to the app, without the link (or its key) in the address bar.
  const leaveCompanyLink = () => {
    history.replaceState(null, '', import.meta.env.BASE_URL);
    setCompanyLink(null);
    setTab('documents');
  };
  useEffect(() => {
    if (loading) return;
    void init(account).then(() => {
      // Once, on load: the home tab is where the app OPENS, not where it stays.
      if (opened.current) return;
      opened.current = true;
      setTab(homeTab.defaultView);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init, loading, account]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <UniversalAppsNavBar
        contentClassName={CONTAINER}
        product="invoices"
        productLogo={<ProductLogo />}
        productHomeHref={import.meta.env.BASE_URL}
        actions={<AppMenu />}
        theme={theme}
        themeStore={useThemeStore}
        appPreferences={
          <>
            <DefaultViewSelect id="home-tab" label="Opens on" fallback="documents" views={TABS} />
            {/* The Documents sidebar's twin of the double tap. */}
            <DefaultViewSelect id="documents-kind" label="Documents shows" fallback="all" views={DOCUMENTS_VIEWS} />
            <TabOrderPreference order={tabOrder} onOrder={setTabOrder} />
          </>
        }
        // The SDK resets its own (Opens on, Documents shows, theme, language); the tab order is ours.
        onResetDefaults={() => setPref('tabOrder', null)}
        suiteSwitcherIconSrc={`${import.meta.env.BASE_URL}unisim-icon.png`}
        // Signed in, the bar says whose it is — "Bradley’s Invoices" — and Tune
        // this app gets the account area, where App name keeps that, goes back
        // to "Universal Invoices" or takes a name they type (SDK 0.212.0). A
        // name ending in s takes only the apostrophe: "James’ Invoices".
        personalTitle={(name) => (name ? `${/s$/i.test(name.trim()) ? `${name}’` : `${name}’s`} Invoices` : 'My Invoices')}
      />
      <div className={`${CONTAINER} pt-4`}>
        <UpdateNotice />
        {/* Keeps the Universal ID company in Your companies, live. */}
        <OrgSync />
        {/* Signed in: a copy on the Universal ID, kept up to date. */}
        <CloudBackup />
        <ShareCleanup />
        {/* Your company links kept current; companies shared with you kept up to date. */}
        <CompanyShareSync />
      </div>

      <main className={`${CONTAINER} flex-1 py-4 sm:py-6`}>

        {SHARE_ID ? (
          <SharedDocument id={SHARE_ID} />
        ) : companyLink ? (
          <SharedCompanyLanding id={companyLink} onDone={leaveCompanyLink} />
        ) : (
          <>
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
          </>
        )}
      </main>
      <Toast message={notice} onDone={dismissNotice} />

      <footer className="border-t border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400`}>
          <p>Quotes, proformas, invoices and delivery notes. {cloudLine ?? 'Everything stays in this browser — back it up from the menu.'}</p>
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
