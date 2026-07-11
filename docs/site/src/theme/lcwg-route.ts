import {useLocation} from '@docusaurus/router';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';

/**
 * Returns true when the current route is inside the
 * "Learn Compact with Games" section. Handles the site's
 * baseUrl prefix (e.g. /docs/) so checks work in both dev
 * and production builds.
 */
export function useIsGamesRoute(): boolean {
  const {pathname} = useLocation();
  const {withBaseUrl} = useBaseUrlUtils();
  const prefix = withBaseUrl('/learn-compact-with-games');
  return pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix);
}
