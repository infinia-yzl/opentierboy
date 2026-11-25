import React from 'react';
import {DownloadIcon} from '@radix-ui/react-icons';

/**
 * Shown while files or links are dragged over the editor (owner decision, 2026-10-31): where to
 * drop images, image links and saved Freeze Frame pictures. It takes no pointer events, so the
 * drop reaches the page under it (components/useSnapshotFiles.tsx: useEditorDrop).
 */
const DropOverlay: React.FC<{visible: boolean}> = ({visible}) => {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      data-html2canvas-ignore
      className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4 bg-muted/80 dark:bg-background/70"
    >
      <div className="flex flex-col items-center gap-3 px-8 py-10 sm:px-[72px] rounded-xl border-2 border-dashed border-primary bg-card text-card-foreground shadow-md text-center">
        <DownloadIcon className="h-10 w-10 text-primary"/>
        <p className="text-xl font-bold">Drop images or image links to add them</p>
        <p className="text-sm text-muted-foreground">Saved Freeze Frame pictures reopen as editable lists.</p>
      </div>
    </div>
  );
};

export default DropOverlay;
