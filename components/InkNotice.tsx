'use client';

import React from 'react';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {ScribbleIcon} from '@/components/ScribbleIcon';
import {useScribble} from '@/components/useScribble';

export const INK_NOTICE_TEXT = 'The scribbles in this link could not be shown.';

export function InkNotice() {
  const {problem} = useScribble();
  if (problem === null) return null;
  return (
    <Alert role="status" className="hide-in-zen max-w-2xl mx-auto my-2" data-html2canvas-ignore>
      <ScribbleIcon className="h-4 w-4"/>
      <AlertDescription>{INK_NOTICE_TEXT}</AlertDescription>
    </Alert>
  );
}
