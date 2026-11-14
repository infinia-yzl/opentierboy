'use client';

import React from 'react';
import {toast} from '@/lib/toast';
import {Button} from '@/components/ui/button';
import {resetTips} from '@/components/useTips';

/** About, "How it works": turns the one-time tips on again and forgets which were seen (lib/tips/tips.ts). */
export function ShowTipsAgain() {
  return (
    <Button
      variant="outline"
      onClick={() => {
        resetTips();
        toast('The tips will show again', {description: 'Each one shows in the editor when it is useful.'});
      }}
    >
      Show the tips again
    </Button>
  );
}
