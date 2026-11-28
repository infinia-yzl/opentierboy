'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toast} from 'sonner';
import {Cross2Icon, ImageIcon} from '@radix-ui/react-icons';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Toggle} from '@/components/ui/toggle';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {ExtractorCrop} from '@/components/ExtractorCrop';
import {ExtractorStage, type StageChange} from '@/components/ExtractorStage';
import {ExtractorNames} from '@/components/ExtractorNames';
import {useItemDetector} from '@/components/useItemDetector';
import {checkPictureFile, cropItem, type LoadedPicture, loadPicture, picturePixels} from '@/components/extractorPicture';
import type {NewListOutcome} from '@/components/useSnapshotFiles';
import {useCustomImages} from '@/contexts/CustomImagesContext';
import {DEVICE_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';
import {
  addBorders,
  type Border,
  BORDER_LIMITS,
  type Fit,
  keptSquare,
  orderBorders,
  removeBorder,
} from '@/lib/extract/borders';
import {itemNames} from '@/lib/extract/names';
import type {Box, ScoredBox} from '@/lib/extract/picture';
import type Item from '@/models/Item';
import {cn} from '@/lib/utils';

export const EXTRACTOR_TEXT = Object.freeze({
  title: 'Extract items from a picture',
  description: 'Put a border around each item, then create a list with them.',
  drop: 'Drop or paste a picture here',
  choose: 'Choose a picture',
  opening: 'Opening the picture…',
  looking: 'Looking for items…',
  noneFound: 'No items found. Draw a border around one item.',
  lookingFailed: 'Items could not be found in this picture. Draw a border around one item.',
  findOfSize: 'Find items of this size',
  noMore: 'No more items of this size found.',
  sameSize: 'Same size for all',
  fit: 'Fit',
  inPicture: 'In the picture',
  whole: 'Whole item',
  square: 'Square cut',
  items: 'Items',
  stepItems: '1 Items',
  stepNames: '2 Names',
  maxBorders: `Up to ${BORDER_LIMITS.maxBorders} items in one picture.`,
  smallest: `An item is at least ${BORDER_LIMITS.smallestSide} pixels wide and tall.`,
  share: 'Your images stay in this browser. A link shares their names; a downloaded Freeze Frame shares the images too.',
  creating: 'Creating…',
  noneAdded: 'No images could be added.',
  tooLong: 'This list is too long for a link. Remove some items and try again.',
  busy: 'A list is being opened. Try again in a moment.',
});

export const foundText = (count: number) => (count === 1 ? '1 item found' : `${count} items found`);
export const moreFoundText = (count: number) => (count === 1 ? '1 more item found' : `${count} more items found`);
export const createText = (count: number) => (count === 1 ? 'Create a list with 1 item' : `Create a list with ${count} items`);

interface Source {
  readonly id: number;
  readonly name: string;
  readonly loaded: LoadedPicture;
  readonly factor: number;
}

type Status = {kind: 'idle'} | {kind: 'busy'; text: string} | {kind: 'done'; text: string};

interface ItemExtractorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (items: Item[]) => NewListOutcome;
  onCloseAutoFocus: (event: Event) => void;
}

function useStageScale(picture: {width: number; height: number} | null) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  useEffect(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setSize({width: entry.contentRect.width, height: entry.contentRect.height}));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);
  const scale = picture && size.width > 0 && size.height > 0 ? Math.min(size.width / picture.width, size.height / picture.height) : 0;
  return {setFrame, scale};
}

function pictureFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  const fromItems = files.length > 0 ? files : Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return fromItems;
}

const ItemExtractor: React.FC<ItemExtractorProps> = ({open, onOpenChange, onCreate, onCloseAutoFocus}) => {
  const {addDeviceImages} = useCustomImages();
  const detector = useItemDetector();
  const [source, setSource] = useState<Source | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({kind: 'idle'});
  const [notice, setNotice] = useState<string | null>(null);
  const [borders, setBorders] = useState<Border[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [sameSize, setSameSize] = useState(true);
  const [fit, setFit] = useState<Fit>('whole');
  const [names, setNames] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'items' | 'names'>('items');
  const [nameIndex, setNameIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sources = useRef(0);
  const alive = useRef(true);
  const sourceRef = useRef<Source | null>(null);
  const focusBorder = useRef<number | null>(null);

  const picture = source ? {width: source.loaded.width, height: source.loaded.height} : null;
  const {setFrame, scale} = useStageScale(picture);
  const ordered = useMemo(() => orderBorders(borders), [borders]);
  const typedNames = useMemo(() => ordered.map((border) => names[border.id] ?? ''), [ordered, names]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.loaded.url);
    };
  }, []);

  useEffect(() => {
    const id = focusBorder.current;
    if (id === null) return;
    const element = content.current?.querySelector<SVGElement>(`[data-border="${id}"]`);
    if (!element) return;
    focusBorder.current = null;
    element.focus();
  });

  const reset = useCallback(() => {
    detector.stop();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.loaded.url);
    sourceRef.current = null;
    sources.current += 1;
    setSource(null);
    setIntakeError(null);
    setStatus({kind: 'idle'});
    setNotice(null);
    setBorders([]);
    setSelected(null);
    setNames({});
    setStep('items');
    setNameIndex(0);
    setCreating(false);
    setCreateError(null);
  }, [detector]);

  const toPicture = (boxes: readonly ScoredBox[], factor: number): Box[] => boxes.map((box) => ({
    x: box.x * factor, y: box.y * factor, width: box.width * factor, height: box.height * factor,
  }));

  const addFound = useCallback((current: Border[], boxes: Box[], bounds: {width: number; height: number}) => {
    const result = addBorders(current, boxes, bounds);
    if (result.leftOut > 0) setNotice(EXTRACTOR_TEXT.maxBorders);
    return result;
  }, []);

  const takeFile = useCallback(async (file: File) => {
    if (creating) return;
    const id = ++sources.current;
    setIntakeError(null);
    setStatus({kind: 'busy', text: EXTRACTOR_TEXT.opening});
    const check = await checkPictureFile(file);
    if (!alive.current || id !== sources.current) return;
    if (!check.ok) {
      setIntakeError(`${file.name}: ${check.message}`);
      setStatus({kind: 'idle'});
      return;
    }
    const loaded = await loadPicture(check.blob);
    if (!alive.current || id !== sources.current) {
      if (loaded) URL.revokeObjectURL(loaded.url);
      return;
    }
    if (!loaded) {
      setIntakeError(`${file.name}: ${DEVICE_IMAGE_REFUSAL_MESSAGES.unreadable}`);
      setStatus({kind: 'idle'});
      return;
    }
    const pixels = await picturePixels(check.blob, loaded).catch(() => null);
    if (!alive.current || id !== sources.current) {
      URL.revokeObjectURL(loaded.url);
      return;
    }
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.loaded.url);
    const next = {id, name: file.name, loaded, factor: pixels?.factor ?? 1};
    sourceRef.current = next;
    setSource(next);
    setBorders([]);
    setSelected(null);
    setNames({});
    setNotice(null);
    setStep('items');
    setNameIndex(0);
    setCreateError(null);
    if (!pixels) {
      setStatus({kind: 'done', text: EXTRACTOR_TEXT.lookingFailed});
      return;
    }
    setStatus({kind: 'busy', text: EXTRACTOR_TEXT.looking});
    const found = await detector.findItems(id, pixels.picture);
    if (!alive.current || id !== sources.current) return;
    if (found === null) {
      setStatus({kind: 'done', text: EXTRACTOR_TEXT.lookingFailed});
      return;
    }
    const result = addFound([], toPicture(found, next.factor), loaded);
    setBorders(result.borders);
    setStatus({kind: 'done', text: result.borders.length > 0 ? foundText(result.borders.length) : EXTRACTOR_TEXT.noneFound});
  }, [creating, detector, addFound]);

  const takeFiles = (files: File[]) => {
    const first = files[0];
    if (first) void takeFile(first);
  };

  const findOfSize = async () => {
    const border = borders.find((item) => item.id === selected);
    if (!source || !border) return;
    const id = source.id;
    setStatus({kind: 'busy', text: EXTRACTOR_TEXT.looking});
    const given = {x: border.x / source.factor, y: border.y / source.factor, width: border.width / source.factor, height: border.height / source.factor};
    const found = await detector.findItemsOfSize(id, given);
    if (!alive.current || id !== sources.current) return;
    if (found === null) {
      setStatus({kind: 'done', text: EXTRACTOR_TEXT.lookingFailed});
      return;
    }
    const result = addFound(borders, toPicture(found, source.factor), source.loaded);
    setBorders(result.borders);
    setStatus({kind: 'done', text: result.added > 0 ? moreFoundText(result.added) : EXTRACTOR_TEXT.noMore});
  };

  const onStageChange = ({borders: next, atSmallest}: StageChange) => {
    setBorders(next);
    if (atSmallest) setNotice(EXTRACTOR_TEXT.smallest);
  };

  const onDraw = (box: Box) => {
    if (!picture) return;
    if (box.width < BORDER_LIMITS.smallestSide || box.height < BORDER_LIMITS.smallestSide) {
      setNotice(EXTRACTOR_TEXT.smallest);
      return;
    }
    const result = addFound(borders, [box], picture);
    if (result.added === 0 && result.leftOut === 0) return;
    setBorders(result.borders);
    const created = result.borders[result.borders.length - 1];
    if (result.added > 0) {
      setSelected(created.id);
      focusBorder.current = created.id;
    }
  };

  const remove = (id: number) => {
    const at = ordered.findIndex((border) => border.id === id);
    const rest = ordered.filter((border) => border.id !== id);
    setBorders((current) => removeBorder(current, id));
    const next = rest[Math.min(at, rest.length - 1)];
    setSelected(next?.id ?? null);
    if (next) focusBorder.current = next.id;
    setNames((current) => {
      const copy = {...current};
      delete copy[id];
      return copy;
    });
  };

  const selectTile = (id: number) => {
    setSelected(id);
    focusBorder.current = id;
    content.current?.querySelector<SVGElement>(`[data-border="${id}"]`)?.focus();
  };

  const setOrderedNames = (next: string[]) => {
    setNames((current) => {
      const copy = {...current};
      ordered.forEach((border, index) => {
        copy[border.id] = next[index] ?? '';
      });
      return copy;
    });
  };

  const create = async () => {
    if (!source || ordered.length === 0 || creating) return;
    setCreating(true);
    setCreateError(null);
    const labels = itemNames(typedNames, source.name);
    const images: {blob: Blob; label: string}[] = [];
    const failures: string[] = [];
    for (const [index, border] of ordered.entries()) {
      const blob = await cropItem(source.loaded, border, fit).catch(() => null);
      if (blob) images.push({blob, label: labels[index]});
      else failures.push(labels[index]);
    }
    const {items, errors} = images.length > 0 ? await addDeviceImages(images) : {items: [], errors: []};
    if (!alive.current) return;
    const problems = [...failures.map((label) => `${label}: ${EXTRACTOR_TEXT.noneAdded}`), ...errors];
    if (items.length === 0) {
      setCreating(false);
      setCreateError(problems.length > 0 ? problems.join(' ') : EXTRACTOR_TEXT.noneAdded);
      return;
    }
    const outcome = onCreate(items);
    if (outcome !== 'opened') {
      setCreating(false);
      setCreateError(outcome === 'too-long' ? EXTRACTOR_TEXT.tooLong : outcome === 'busy' ? EXTRACTOR_TEXT.busy : EXTRACTOR_TEXT.noneAdded);
      return;
    }
    if (problems.length > 0) toast.error('Some images could not be added', {description: problems.join(' ')});
    onOpenChange(false);
    reset();
  };

  const onDragOver = (event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = creating ? 'none' : 'copy';
  };

  const onDrop = (event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    takeFiles(pictureFiles(event.dataTransfer));
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea')) return;
    const files = pictureFiles(event.clipboardData).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    event.preventDefault();
    takeFiles(files);
  };

  const first = ordered[0] ?? null;
  const count = ordered.length;
  const busy = status.kind === 'busy';

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && creating) return;
      onOpenChange(next);
      if (!next) reset();
    }}>
      <DialogContent
        ref={content}
        className="flex h-[92vh] w-[96vw] max-w-[min(96vw,1440px)] flex-col gap-3 p-4"
        onCloseAutoFocus={onCloseAutoFocus}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{EXTRACTOR_TEXT.title}</DialogTitle>
          <DialogDescription>{EXTRACTOR_TEXT.description}</DialogDescription>
        </DialogHeader>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            takeFiles(files);
          }}
        />
        {!source ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center">
            <ImageIcon aria-hidden="true" className="h-7 w-7 text-muted-foreground"/>
            <p className="text-[15px] font-semibold">{EXTRACTOR_TEXT.drop}</p>
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>{EXTRACTOR_TEXT.choose}</Button>
            <p aria-live="polite" className="text-sm text-muted-foreground">{busy ? status.text : ''}</p>
            {intakeError && <p role="alert" className="text-sm text-destructive">{intakeError}</p>}
          </div>
        ) : (
          <Tabs value={step} onValueChange={(value) => setStep(value === 'names' ? 'names' : 'items')} className="flex min-h-0 flex-1 flex-col gap-3">
            <TabsList aria-label="Steps" className="self-start">
              <TabsTrigger value="items">{EXTRACTOR_TEXT.stepItems}</TabsTrigger>
              <TabsTrigger value="names" disabled={count === 0}>{EXTRACTOR_TEXT.stepNames}</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-0 flex min-h-0 flex-1 gap-4 data-[state=inactive]:hidden">
              <div ref={setFrame} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
                {scale > 0 && (
                  <ExtractorStage
                    src={source.loaded.url}
                    picture={source.loaded}
                    scale={scale}
                    borders={ordered}
                    selected={selected}
                    fit={fit}
                    sameSize={sameSize}
                    onSelect={setSelected}
                    onChange={onStageChange}
                    onDraw={onDraw}
                    onRemove={remove}
                  />
                )}
              </div>
              <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
                <p aria-live="polite" className="text-sm font-medium">{status.kind === 'idle' ? '' : status.text}</p>
                {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
                {intakeError && <p role="alert" className="text-sm text-destructive">{intakeError}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={selected === null || busy} onClick={() => void findOfSize()}>
                    {EXTRACTOR_TEXT.findOfSize}
                  </Button>
                  <Toggle variant="outline" size="sm" pressed={sameSize} onPressedChange={setSameSize}>
                    {EXTRACTOR_TEXT.sameSize}
                  </Toggle>
                </div>
                <div role="group" aria-labelledby="extractor-fit" className="flex flex-col gap-2">
                  <p id="extractor-fit" className="text-sm font-medium">{EXTRACTOR_TEXT.fit}</p>
                  <div className="flex items-end gap-2">
                    {first && (
                      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <ExtractorCrop src={source.loaded.url} picture={source.loaded} box={first} size={48} shape="as-is"/>
                        {EXTRACTOR_TEXT.inPicture}
                      </div>
                    )}
                    {(['whole', 'square'] as const).map((option) => (
                      <Toggle
                        key={option}
                        variant="outline"
                        pressed={fit === option}
                        onPressedChange={(pressed) => {
                          if (pressed) setFit(option);
                        }}
                        className="h-auto flex-col gap-1 px-2 py-1.5 text-xs"
                      >
                        {first && (
                          <ExtractorCrop
                            src={source.loaded.url}
                            picture={source.loaded}
                            box={option === 'square' ? keptSquare(first) : first}
                            size={48}
                            shape={option === 'square' ? 'fill' : 'contain'}
                          />
                        )}
                        {option === 'whole' ? EXTRACTOR_TEXT.whole : EXTRACTOR_TEXT.square}
                      </Toggle>
                    ))}
                  </div>
                </div>
                <div className="flex min-h-0 flex-col gap-2">
                  <p id="extractor-items" className="text-sm font-medium">{EXTRACTOR_TEXT.items}</p>
                  <ol aria-labelledby="extractor-items" className="grid grid-cols-4 gap-1.5">
                    {ordered.map((border, index) => (
                      <li key={border.id} className="relative">
                        <button
                          type="button"
                          aria-label={`Select item ${index + 1}`}
                          onClick={() => selectTile(border.id)}
                          className={cn('block rounded-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                            border.id === selected && 'ring-2 ring-primary')}
                        >
                          <ExtractorCrop
                            src={source.loaded.url}
                            picture={source.loaded}
                            box={fit === 'square' ? keptSquare(border) : border}
                            size={60}
                            shape={fit === 'square' ? 'fill' : 'contain'}
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() => remove(border.id)}
                          className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <Cross2Icon aria-hidden="true" className="h-3 w-3"/>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="names" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              {step === 'names' && count > 0 && (
                <ExtractorNames
                  src={source.loaded.url}
                  picture={source.loaded}
                  borders={ordered}
                  names={typedNames}
                  fileName={source.name}
                  index={Math.min(nameIndex, count - 1)}
                  onIndex={setNameIndex}
                  onNames={setOrderedNames}
                  onDone={() => createButton.current?.focus()}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{EXTRACTOR_TEXT.share}</p>
          <div className="flex flex-col items-end gap-1">
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            <Button ref={createButton} disabled={count === 0 || creating || busy} onClick={() => void create()}>
              {creating ? EXTRACTOR_TEXT.creating : createText(count)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ItemExtractor;
