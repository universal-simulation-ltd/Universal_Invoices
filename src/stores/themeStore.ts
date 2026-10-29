import { createThemeStore, type ThemePref } from '@unisim/sdk';

// The light/dark/system preference. It opens LIGHT and stays light until the
// user chooses otherwise (the suite rule). The PDF is always black on white —
// this is the app's chrome only.
//
// ⚠️ The key is every user's saved choice. Renaming it silently resets them all
// to light.
export type { ThemePref };

export const useThemeStore = createThemeStore('unisim-invoices-theme');
