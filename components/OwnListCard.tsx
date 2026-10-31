'use client';

import React, {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Separator} from '@/components/ui/separator';
import {cn} from '@/lib/utils';
import type {HomeFileRequest} from '@/components/HomeFileOpener';

// Loaded when the visitor first chooses or drops a file: the landing page itself opens no
// device store and loads none of the editor's code.
const HomeFileOpener = dynamic(() => import('@/components/HomeFileOpener'), {ssr: false});

/** True for a drag or drop that carries files (not text or a link). */
function carriesFiles(event: DragEvent | React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * The third card of "Create a New Tier List" (HomeFinal board): Create Blank List, Open a Freeze
 * Frame, and a drop area for images and Freeze Frames (hidden on phones, which cannot drop
 * files). Chosen and dropped files open as in the editor (components/HomeFileOpener.tsx).
 */
const OwnListCard: React.FC = () => {
  const [request, setRequest] = useState<HomeFileRequest | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const dropArea = useRef<HTMLDivElement>(null);
  /** dragenter and dragleave come in pairs for each element the pointer crosses. */
  const depth = useRef(0);

  const open = (files: File[]) => {
    if (files.length > 0) setRequest({files});
  };

  // Files dropped anywhere else on the page do nothing. Without this, the browser would leave
  // the site to show a file that missed the drop area.
  useEffect(() => {
    const outside = (event: DragEvent) => carriesFiles(event)
      && !(event.target instanceof Node && dropArea.current?.contains(event.target));
    const onDragOver = (event: DragEvent) => {
      if (!outside(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (event: DragEvent) => {
      if (outside(event)) event.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <Card role="region" aria-labelledby="own-list" className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-col gap-1.5">
        <h3 id="own-list" className="font-heading text-[22px] font-black leading-tight [font-variation-settings:'SHRP'_100]">
          Your own list
        </h3>
        <Separator/>
      </div>
      <Button asChild className="w-full gap-2">
        <Link href="/rank/">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          Create Blank List
        </Link>
      </Button>
      <Button ref={openButton} variant="outline" className="w-full gap-2" onClick={() => fileInput.current?.click()}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
        Open a Freeze Frame
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Clear the input, so choosing the same file again opens it again.
          event.target.value = '';
          open(files);
        }}
      />
      <div
        ref={dropArea}
        className={cn(
          'hidden grow flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3.5 text-center transition-colors md:flex',
          dragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/40 bg-muted',
        )}
        onDragEnter={(event) => {
          if (!carriesFiles(event)) return;
          depth.current += 1;
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!carriesFiles(event)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDragOver={(event) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          depth.current = 0;
          setDragging(false);
          open(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>
          </svg>
          Drop images or a Freeze Frame here
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground">
          Images start a new list. A Freeze Frame reopens as an editable list.
        </span>
      </div>
      {request && <HomeFileOpener request={request} returnFocusRef={openButton}/>}
    </Card>
  );
};

export default OwnListCard;
