import { useCallback, useRef } from 'react';

/**
 * Esri widgets take ownership of the DOM node passed as `container` and remove
 * it on destroy(). Handing them a React-rendered node means React's next
 * reconcile operates on a detached element — under StrictMode's double-invoke
 * the widget ends up rendering into a node that is no longer in the document,
 * so the panel silently comes up empty.
 *
 * This hook keeps one React-owned host element and hands each widget a fresh
 * child of it. Destroying the widget removes only that child.
 *
 *   const [hostRef, makeContainer] = useWidgetContainer();
 *   ...
 *   const widget = new Print({ view, container: makeContainer() });
 *   return () => widget.destroy();
 *   ...
 *   return <div ref={hostRef} className="hp-esri-widget" />;
 */
export function useWidgetContainer(): [
  React.RefObject<HTMLDivElement | null>,
  () => HTMLDivElement | undefined,
] {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const makeContainer = useCallback((): HTMLDivElement | undefined => {
    const host = hostRef.current;
    if (!host) return undefined;
    host.replaceChildren();
    const container = document.createElement('div');
    host.append(container);
    return container;
  }, []);

  return [hostRef, makeContainer];
}
