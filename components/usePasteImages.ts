import {useEffect} from 'react';
import {toast} from 'sonner';
import {useTierContext} from '@/contexts/TierContext';
import {useCustomImages} from '@/contexts/CustomImagesContext';
import {useAddItemsWithUndo} from '@/components/useAddItems';
import {pastedImageLabel} from '@/lib/images/listImages';

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
 * Pasting an image anywhere in the editor adds it as an item from the device, like "From your
 * device". Pastes into a text field or a dialog are left alone.
 *
 * Pasting images was first proposed in pull request #146 by JB Wilson (Selenestica).
 */
export function usePasteImages() {
  const {tiers} = useTierContext();
  const {addDeviceImages} = useCustomImages();
  const addItemsWithUndo = useAddItemsWithUndo();

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      const files = pastedImages(event);
      if (files.length === 0) return;
      event.preventDefault();
      const taken = new Set(tiers.flatMap((tier) => tier.items.map((item) => item.content)));
      const images = files.map((file) => {
        const label = pastedImageLabel(file.name, taken);
        taken.add(label);
        return {blob: file, label};
      });
      void addDeviceImages(images).then(({items, errors}) => {
        if (items.length > 0) addItemsWithUndo(items);
        if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [tiers, addDeviceImages, addItemsWithUndo]);
}
