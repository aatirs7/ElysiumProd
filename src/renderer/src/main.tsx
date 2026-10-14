import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import '@fontsource-variable/instrument-sans';
import './styles.css';
import { App } from './App';
import { QuickBar } from './QuickBar';
import { useAppearance } from './theme';
import { DEFAULT_SETTINGS, type Settings } from './workspace/store';

const isQuick = location.hash === '#quick';

/** The quick bar is a separate small window; it follows the same theme as the app. */
function QuickRoot() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const read = () => void window.elysium.loadWorkspace().then((j) => { try { setS({ ...DEFAULT_SETTINGS, ...(JSON.parse(j ?? '{}').settings ?? {}) }); } catch { /* defaults */ } });
    read();
    return window.elysium.onQuickShown(read);
  }, []);
  useAppearance(s, true);
  return <QuickBar />;
}

if (isQuick) document.documentElement.classList.add('quick');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isQuick ? <QuickRoot /> : <App />}</StrictMode>,
);
