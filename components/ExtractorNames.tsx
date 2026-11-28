import React, {useEffect, useRef} from 'react';
import {CheckIcon} from '@radix-ui/react-icons';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ExtractorCrop} from '@/components/ExtractorCrop';
import {type Border, type Bounds, contextBox} from '@/lib/extract/borders';
import {automaticName, fillNames, pastedNames} from '@/lib/extract/names';
import {cn} from '@/lib/utils';

interface ExtractorNamesProps {
  src: string;
  picture: Bounds;
  borders: readonly Border[];
  names: readonly string[];
  fileName: string;
  index: number;
  onIndex: (index: number) => void;
  onNames: (names: string[]) => void;
  onDone: () => void;
}

export const ExtractorNames: React.FC<ExtractorNamesProps> = ({
  src, picture, borders, names, fileName, index, onIndex, onNames, onDone,
}) => {
  const field = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const current = borders[index];
  const total = borders.length;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      field.current?.focus();
      strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    });
    return () => cancelAnimationFrame(frame);
  }, [index]);

  if (!current) return null;

  const goTo = (next: number) => {
    if (next >= total) {
      onDone();
      return;
    }
    onIndex(Math.max(0, next));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    goTo(event.shiftKey ? index - 1 : index + 1);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = pastedNames(event.clipboardData.getData('text/plain'));
    if (lines.length < 2) return;
    event.preventDefault();
    const filled = fillNames(names, index, lines);
    onNames(filled.names);
    goTo(filled.last + 1);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <ExtractorCrop
          src={src}
          picture={picture}
          box={contextBox(current, picture)}
          highlight={current}
          size={360}
          shape="as-is"
        />
        <p aria-live="polite" className="text-sm text-muted-foreground">Item {index + 1} of {total}</p>
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <Label htmlFor="extractor-name">Name</Label>
          <Input
            id="extractor-name"
            ref={field}
            autoComplete="off"
            value={names[index] ?? ''}
            placeholder={automaticName(fileName, index + 1)}
            onChange={(event) => onNames(names.map((name, at) => (at === index ? event.target.value : name)))}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          <p className="text-xs text-muted-foreground">Enter: next item. Shift+Enter: back. Paste several lines to name several items.</p>
        </div>
      </div>
      <ol ref={strip} aria-label="Items" className="flex shrink-0 gap-1.5 overflow-x-auto pb-2">
        {borders.map((border, at) => {
          const named = (names[at] ?? '').trim() !== '';
          return (
            <li key={border.id} className="shrink-0">
              <button
                type="button"
                aria-label={named ? `Item ${at + 1}: ${names[at].trim()}` : `Item ${at + 1}`}
                aria-current={at === index}
                onClick={() => onIndex(at)}
                className={cn('relative block rounded-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                  at === index && 'ring-2 ring-primary')}
              >
                <ExtractorCrop src={src} picture={picture} box={border} size={40} shape="contain"/>
                {named && (
                  <span className="absolute right-0 bottom-0 rounded-tl-sm bg-primary text-primary-foreground">
                    <CheckIcon aria-hidden="true" className="h-3 w-3"/>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
