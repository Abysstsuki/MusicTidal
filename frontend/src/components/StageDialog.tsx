'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useToast } from '@/contexts/ToastContext';

// Native dialog supplies focus containment, Escape and focus restoration.
export default function StageDialog({ label, onClose, children, closeOnBackdrop = true, className = '' }: { label: string; onClose: () => void; children: ReactNode; closeOnBackdrop?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { registerHost } = useToast();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // Native dialogs occupy the top layer; toast content must share that layer.
    return registerHost(dialog);
  }, [registerHost]);
  return <dialog ref={ref} className={'stage-dialog ' + className} aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}><div className="dialog-content">{children}</div></dialog>;
}
