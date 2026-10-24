import type { ReactNode } from 'react';
import { go } from '../router';

export function ProgressBar({ percent, label, right, tone = 'main' }: { percent: number; label?: string; right?: ReactNode; tone?: 'main' | 'side' }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="pbar-wrap">
      {(label || right) && <div className="pbar-head"><span>{label}</span><span className="muted">{right}</span></div>}
      <div className={`pbar ${tone}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="pbar-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><h2>{title}</h2>{onClose && <button className="ghost" onClick={onClose} aria-label="Close">✕</button>}</div>
        {children}
      </div>
    </div>
  );
}

export function PageHead({ title, back = '/', sub }: { title: string; back?: string; sub?: string }) {
  return (
    <div className="page-head">
      <button className="ghost" onClick={() => go(back)}>← Back</button>
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'main' | 'side' | 'warn' | 'must' | 'ok' | 'info' }) {
  return <span className={`chip ${tone ?? ''}`}>{children}</span>;
}
