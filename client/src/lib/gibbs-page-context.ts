/** Native-page context for Gibbs: a page can register a compact plain-text
 *  description of what's on screen, and every Gibbs ask ships it with the
 *  question — so "this package" / "this page" just works. Pages set it on
 *  mount/update and clear it (null) on unmount; everywhere else it stays
 *  null and requests are unchanged. */
let current: string | null = null;

export const setGibbsPageContext = (ctx: string | null) => {
  current = ctx ? ctx.slice(0, 800) : null;
};

export const getGibbsPageContext = (): string | null => current;
