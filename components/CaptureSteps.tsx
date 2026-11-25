import React from 'react';
import {CheckIcon, CircleIcon, UpdateIcon} from '@radix-ui/react-icons';
import {cn} from '@/lib/utils';

export type CapturePhase = 'idle' | 'preparing' | 'drawing' | 'encoding';

const CAPTURE_STEPS = [
  {phase: 'preparing', label: 'Loading images'},
  {phase: 'drawing', label: 'Drawing the image'},
  {phase: 'encoding', label: 'Saving the image'},
] as const;

export function CaptureSteps({phase}: {phase: CapturePhase}) {
  const current = CAPTURE_STEPS.findIndex((step) => step.phase === phase);
  if (current === -1) return null;
  return (
    <ol aria-label="Capture steps" className="space-y-2">
      {CAPTURE_STEPS.map((step, index) => {
        const done = index < current;
        const running = index === current;
        const Icon = done ? CheckIcon : running ? UpdateIcon : CircleIcon;
        return (
          <li
            key={step.phase}
            aria-current={running ? 'step' : undefined}
            className={cn(
              'flex h-6 items-center gap-2 rounded-md px-2 text-sm',
              running ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', running && 'animate-spin')}/>
            <span className="min-w-0 grow truncate">{step.label}</span>
            {' '}
            {done && <span className="shrink-0 text-xs">Done</span>}
            {running && <span className="shrink-0 text-xs">{`Step ${index + 1} of ${CAPTURE_STEPS.length}`}</span>}
          </li>
        );
      })}
    </ol>
  );
}
