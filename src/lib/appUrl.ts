/**
 * Resolves an app-relative path against the deployment base.
 *
 * A leading slash means "site root", which is only the same thing as "app
 * root" when the app is deployed at the domain root. Under a sub-path — the
 * Pages previews, for instance — a site-absolute path silently 404s, which is
 * how the hunt inventory went missing while the file sat right next to the
 * bundle that was asking for it.
 */
export function appUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  const base = import.meta.env.BASE_URL || '/';
  return path.startsWith('/')
    ? `${base.replace(/\/$/, '')}${path}`
    : `${base}${path}`;
}
