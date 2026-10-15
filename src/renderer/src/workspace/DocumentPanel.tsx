import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, FolderOpen, Minus, Plus, RefreshCw } from 'lucide-react';
import type { DocFile } from '@shared/ipc';
import { md, onLinkClick } from './project-widgets';


export interface DocParams { path?: string; zoom?: number }

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function DocumentPanel(props: IDockviewPanelProps<DocParams>) {
  const [doc, setDoc] = useState<DocFile | null>(null);
  const path = props.params.path;
  const zoom = props.params.zoom ?? 1;

  const load = async (p: string) => {
    const d = await window.elysium.readDocument(p);
    setDoc(d);
    props.api.setTitle(base(p));
  };
  useEffect(() => { if (path) void load(path); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path]);

  const pick = async () => {
    const p = await window.elysium.pickDocument();
    if (p) props.api.updateParameters({ ...props.params, path: p });
  };
  const setZoom = (z: number) => props.api.updateParameters({ ...props.params, zoom: Math.min(3, Math.max(0.5, Math.round(z * 10) / 10)) });

  return (
    <div className="widget column">
      <div className="bar">
        <button className="ghost-btn" onClick={pick}><FolderOpen size={14} />{path ? 'Open another' : 'Open a file'}</button>
        {path && <span className="muted small ellipsis" title={path}>{base(path)}</span>}
        <span className="spacer" />
        {doc?.kind === 'pdf' && (
          <div className="seg">
            <button onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out"><Minus size={13} /></button>
            <button className="on" style={{ minWidth: 52 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in"><Plus size={13} /></button>
          </div>
        )}
        {path && <button className="ghost-icon" onClick={() => path && void load(path)} title="Reload" aria-label="Reload"><RefreshCw size={14} /></button>}
      </div>
      <div className="scroll" onClick={onLinkClick}>
        {!path && (
          <div className="empty-state doc-empty">
            <FileText size={28} strokeWidth={1.5} />
            <div>Markdown, PDF, text, JSON or logs</div>
            <button className="btn primary" onClick={pick}><FolderOpen size={14} />Choose a file</button>
          </div>
        )}
        {doc && !doc.ok && <div className="empty-state error-text">{doc.error}</div>}
        {doc?.ok && doc.kind === 'markdown' && <article className="prose doc" dangerouslySetInnerHTML={{ __html: md(doc.text ?? '') }} />}
        {doc?.ok && doc.kind === 'text' && <pre className="doc-text">{doc.text}</pre>}
        {doc?.ok && doc.kind === 'pdf' && doc.bytes && <PdfView bytes={doc.bytes} zoom={zoom} />}
      </div>
    </div>
  );
}

function PdfView({ bytes, zoom }: { bytes: Uint8Array; zoom: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<string>('Rendering');

  useEffect(() => {
    let cancelled = false;
    const el = host.current!;
    el.innerHTML = '';
    let task: { promise: Promise<any>; destroy(): Promise<void> } | null = null;
    // pdf.js loads only when a PDF is opened, so it never slows the app's start.
    void import('pdfjs-dist').then((pdfjs) => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      // pdf.js takes ownership of the buffer, so give it a copy.
      task = pdfjs.getDocument({ data: bytes.slice() });
      return task.promise;
    }).then(async (pdf) => {
      if (!pdf || cancelled) return;
      const pages = Math.min(pdf.numPages, 300);
      setInfo(`${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`);
      const width = Math.max(320, el.clientWidth - 32);
      for (let i = 1; i <= pages && !cancelled; i++) {
        const page = await pdf.getPage(i);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = (width / unscaled.width) * zoom;
        const vp = page.getViewport({ scale: scale * window.devicePixelRatio });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${vp.width / window.devicePixelRatio}px`;
        canvas.className = 'pdf-page';
        el.appendChild(canvas);
        await page.render({ canvas, viewport: vp }).promise;
      }
    }).catch((e: unknown) => setInfo(`Could not render: ${e instanceof Error ? e.message : String(e)}`));
    return () => { cancelled = true; void task?.destroy(); };
  }, [bytes, zoom]);

  return (
    <>
      <div className="pdf-pages" ref={host} />
      <div className="source">{info}</div>
    </>
  );
}
