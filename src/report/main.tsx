import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Report } from './Report';
import './report.css';

/**
 * Entry point for /changes.html.
 *
 * Separate from the map's entry on purpose: nothing here imports @arcgis/core,
 * so a reader opening the change report does not download a mapping SDK to
 * read two tables.
 */
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root is missing from changes.html');

createRoot(rootEl).render(
  <StrictMode>
    <Report />
  </StrictMode>,
);
