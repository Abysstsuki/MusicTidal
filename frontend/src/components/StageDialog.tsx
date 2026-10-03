'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Native dialog supplies focus containment, Escape and focus restoration.
export default function StageDialog({ label, onClose, children, closeOnBackdrop = true, className = '' }: { label: string; onClose: () => void; children: ReactNode; closeOnBackdrop?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={'stage-dialog ' + className} aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}><div className="dialog-content">{children}</div></dialog>;
}
