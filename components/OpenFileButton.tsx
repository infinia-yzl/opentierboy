import React, {useRef} from 'react';
import type {FileSource} from '@/components/useSnapshotFiles';
import {FaRegFolderOpen} from 'react-icons/fa6';
import {Button} from '@/components/ui/button';

interface OpenFileButtonProps {
  /** Called with the chosen file (components/useSnapshotFiles.tsx: openFiles). */
  onFiles: (files: File[], source: FileSource) => void;
  /** Focus returns to the button after the "Open the list in this file?" dialog. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}

/** The picture types Open file offers. The bytes are checked again after choosing. */
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

/**
 * The editor's "Open file" button: opens a Freeze Frame download that holds a list, or adds any
 * other picture as an item. The file input stays hidden; the button opens the file chooser.
 */
const OpenFileButton: React.FC<OpenFileButtonProps> = ({onFiles, buttonRef}) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button ref={buttonRef} variant="outline" size="icon" onClick={() => input.current?.click()}>
        <FaRegFolderOpen className="h-4 w-4"/>
        <span className="sr-only">Open file</span>
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Clear the input, so choosing the same file again opens it again.
          event.target.value = '';
          if (files.length > 0) onFiles(files, 'open');
        }}
      />
    </>
  );
};

export default OpenFileButton;
