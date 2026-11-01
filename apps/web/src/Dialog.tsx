import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const backdrop = panel.current?.parentElement;
    const background = [...document.body.children].filter((element) => element !== backdrop) as HTMLElement[];
    const backgroundState = background.map((element) => ({ element, inert: element.inert, hadInert: element.hasAttribute('inert'), ariaHidden: element.getAttribute('aria-hidden') }));
    background.forEach((element) => { element.inert = true; element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); });
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-button)')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
      if (focusable.length === 0) { event.preventDefault(); panel.current?.focus(); return; }
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      backgroundState.forEach(({ element, inert, hadInert, ariaHidden }) => {
        element.inert = inert;
        if (hadInert) element.setAttribute('inert', ''); else element.removeAttribute('inert');
        if (ariaHidden == null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden);
      });
      previous?.focus();
    };
  }, []);
  return createPortal(<div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
      <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>, document.body);
}
