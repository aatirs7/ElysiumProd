import type { ElysiumApi } from '@shared/ipc';

declare global {
  interface Window {
    elysium: ElysiumApi;
    __smoke?: { launch(templateId: string): Promise<unknown>; type(data: string): void; screen(): string; open?(req: import('./workspace/store').OpenRequest): void; popout?(): Promise<string>; closeProjectView?(projectId: string): boolean; viewPanels?(): string[] };
  }
}
export {};
