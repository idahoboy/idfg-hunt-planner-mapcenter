import { useEffect, useRef, type ReactNode } from 'react';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  align?: 'start' | 'end';
}

/**
 * Dismissible popover with focus containment. The legacy bootstrap-select
 * dropdowns were not keyboard reachable and trapped screen readers on mobile;
 * this restores focus to the trigger on close and closes on Escape.
 */
export function Popover({ open, onClose, labelledBy, children, align = 'start' }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const node = ref.current;
      if (!node) return;
      const target = event.target as Node;
      if (!node.contains(target) && !document.getElementById(labelledBy)?.contains(target)) {
        onClose();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        document.getElementById(labelledBy)?.focus();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, labelledBy]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`hp-popover hp-popover--${align}`}
      role="dialog"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
}
