import {useEffect} from 'react';
import type {FileSource} from '@/components/useSnapshotFiles';

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
 * device", and a snapshot file asks whether to open its list. Pastes into a text field or a
 * dialog are left alone.
 *
 * Pasting images was first proposed in pull request #146 by JB Wilson (Selenestica).
 */
export function usePasteImages(openFiles: (files: File[], source: FileSource) => void) {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      const files = pastedImages(event);
      if (files.length === 0) return;
      event.preventDefault();
      openFiles(files, 'paste');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openFiles]);
}
