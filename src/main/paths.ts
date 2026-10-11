// Where ElysiumProd keeps its state: %APPDATA%\elysiumprod (spec section 15).
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function dataDir(): string {
  const dir = join(app.getPath('appData'), 'elysiumprod');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function scrollbackDir(): string {
  const dir = join(dataDir(), 'scrollback');
  mkdirSync(dir, { recursive: true });
  return dir;
}
