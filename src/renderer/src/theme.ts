// Applies the appearance settings to the whole app: theme, accent, text size,
// density, and the colour of the Windows caption buttons over the top bar.
import { useEffect } from 'react';
import type { Settings, ThemeId } from './workspace/store';

function resolve(theme: ThemeId): Exclude<ThemeId, 'system'> {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claude-light' : 'claude-dark';
}

export function useAppearance(s: Settings, isQuick = false): void {
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = resolve(s.theme);
      root.dataset.density = s.density;
      root.style.setProperty('--ui-size', `${s.textSize}px`);
      if (s.accent) root.style.setProperty('--accent-user', s.accent); else root.style.removeProperty('--accent-user');
      if (isQuick) return;
      // Match the caption buttons to the top bar after the theme's variables apply.
      requestAnimationFrame(() => {
        const cs = getComputedStyle(root);
        const bg = toHex(cs.getPropertyValue('--bg').trim());
        const fg = toHex(cs.getPropertyValue('--text-2').trim());
        if (bg && fg) window.elysium.setTitleBarColors(bg, fg);
      });
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme, s.density, s.textSize, s.accent, isQuick]);
}

function toHex(v: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}
