import {useEffect} from 'react';
import {type FoundLinkImages, foundNothing, linkImagesFromPaste} from '@/lib/images/droppedLinks';

/** Images in a paste event, from its files or its file items. */
function pastedImages(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  const fromItems = files.length > 0 ? files : Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems.filter((file) => file.type.startsWith('image/'));
}

/**
 * Pasting an image anywhere in the editor opens it like a dropped file (`openFiles` from
 * components/useSnapshotFiles.tsx): a picture becomes an item from the device, like "From your
 * device", and a snapshot file asks whether to open its list. A pasted image address becomes a
 * link image, with the checks of "From a link" (`openLinks`, issue #107); text without an
 * address is left alone. Pastes into a text field or a dialog are left alone.
 *
 * Pasting images was first proposed in pull request #146 by JB Wilson (Selenestica).
 */
export function usePasteImages(openFiles: (files: File[]) => void, openLinks: (found: FoundLinkImages) => void) {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      const files = pastedImages(event);
      if (files.length > 0) {
        event.preventDefault();
        openFiles(files);
        return;
      }
      const found = linkImagesFromPaste(event.clipboardData?.getData('text/plain') ?? '');
      if (foundNothing(found)) return;
      event.preventDefault();
      openLinks(found);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openFiles, openLinks]);
}
