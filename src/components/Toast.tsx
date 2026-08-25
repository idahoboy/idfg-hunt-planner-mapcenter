import { useEffect } from 'react';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';

export function Toast(): React.ReactElement | null {
  const toast = useAppStore((s) => s.toast);
  const dismiss = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className={`hp-toast hp-toast--${toast.tone}`} role="status" aria-live="polite">
      <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'} size={16} />
      <span>{toast.message}</span>
      <button type="button" className="hp-toast__close" onClick={dismiss} aria-label="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
