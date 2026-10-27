import { useId } from 'react';

/**
 * The Elysium E-brackets mark. Geometry copied unchanged from the official
 * asset (elysiumcyber logo.svg, via elysiumse7en's elysium-mark.tsx); the brand
 * notes say to use the real files and never redraw the logo.
 *
 * Two changes, the same ones elysiumse7en made: fills use currentColor so the
 * mark follows the theme, and mask ids are unique per instance (useId) because
 * the mark renders more than once and duplicate ids collide silently.
 * The mask fills stay white and black: they are mask channels, not colours.
 * The view box is cropped to the mark's own bounds (x 174 to 338, y 165 to 339 in
 * the 512 canvas); the source file centres a small mark in a large square.
 */
export function Logo({ className = 'logo' }: { className?: string }) {
  // React 19 ids contain characters that break url(#id) references, so keep only safe ones.
  const id = `em${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const half = (side: 'l' | 'r', transform: string) => (
    <g transform={transform}>
      <g transform="translate(-14 -38) scale(0.55)">
        <mask id={`${id}-${side}-top`}>
          <rect x="0" y="0" width="50" height="50" fill="white" />
          <circle cx="50" cy="50" r="30" fill="black" />
        </mask>
        <rect x="0" y="0" width="50" height="50" fill="currentColor" mask={`url(#${id}-${side}-top)`} />
        <polygon points="5,66 15,60 25,60 35,66 25,72 15,72" fill="currentColor" />
        <mask id={`${id}-${side}-bot`}>
          <rect x="0" y="0" width="50" height="50" fill="white" />
          <circle cx="50" cy="50" r="30" fill="black" />
        </mask>
        <g transform="translate(0 82) scale(1 -1) translate(0 -50)">
          <rect x="0" y="0" width="50" height="50" fill="currentColor" mask={`url(#${id}-${side}-bot)`} />
        </g>
      </g>
    </g>
  );
  return (
    <svg className={className} viewBox="166 160 180 182" aria-hidden="true" focusable="false">
      <g transform="translate(256 256) scale(3.2) translate(-30 0)">
        {half('l', 'translate(15 0) scale(0.75)')}
        {half('r', 'translate(45 0) scale(-0.75, 0.75)')}
      </g>
    </svg>
  );
}
