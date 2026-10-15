// Applies the appearance settings to the whole app: theme, accent, text size,
// density, and the colour of the Windows caption buttons over the top bar.
import { useEffect } from 'react';
import type { Settings, ThemeId } from './workspace/store';

function resolve(theme: ThemeId, custom?: Settings['customTheme']): Exclude<ThemeId, 'system' | 'custom'> {
  if (theme === 'custom') return custom?.base ?? 'claude-dark';
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claude-light' : 'claude-dark';
}

export function useAppearance(s: Settings, isQuick = false): void {
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = resolve(s.theme, s.customTheme);
      // Your own theme paints over its base; any other theme clears it.
      const c = s.theme === 'custom' ? s.customTheme : null;
      for (const k of CUSTOM_KEYS) { const v = c?.vars[k]; if (v) root.style.setProperty(k, v); else root.style.removeProperty(k); }
      if (c) { root.style.setProperty('--grain-o', String([0, 0.05, 0.09, 0.14][c.grain] ?? 0.05)); root.style.setProperty('--radius', `${c.radius}px`); root.dataset.grid = c.grid ? 'on' : 'off'; }
      else { root.style.removeProperty('--grain-o'); root.style.removeProperty('--radius'); delete root.dataset.grid; }
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
  }, [s.theme, s.density, s.textSize, s.accent, s.customTheme, isQuick]);
}

const CUSTOM_KEYS = ['--bg', '--chrome', '--surface', '--surface-2', '--text', '--text-2', '--accent-default', '--term'] as const;

function toHex(v: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}
