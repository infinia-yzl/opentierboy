/**
 * True when a click starts a navigation to another page of this site: a plain left click on a
 * link that opens here, to another path. Next.js drops a navigation still loading when the
 * address changes, so files that wait or arrive after such a click are not added: adding one
 * writes the address, which would keep the visitor in the editor
 * (components/useSnapshotFiles.tsx). A change the visitor makes in the editor is still written
 * at once, and keeps them there.
 */
export function isLinkToAnotherPage(event: MouseEvent, here: Location): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return false;
  const url = new URL(link.href, here.href);
  return url.origin === here.origin && url.pathname !== here.pathname;
}
