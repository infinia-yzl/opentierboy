'use client';

import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {checkFile} from "@/components/useSnapshotFiles";
import {useTemplateIndices} from "@/components/useTemplateIndices";
import type {TemplateEntry} from "@/lib/templates/indexFormat";
import {MAX_TEMPLATE_INDICES} from "@/lib/templates/indexList";
import type {LoadedTemplateIndex} from "@/lib/templates/loadIndex";
import {
  ADD_INDEX_MESSAGES,
  LOAD_INDEX_MESSAGES,
  TEMPLATE_FILE_MESSAGES,
  TEMPLATE_INDEX_NOTICE,
  TEMPLATE_WITHOUT_LIST,
} from "@/lib/templates/messages";
import {fetchTemplateFile} from "@/lib/templates/templateFile";

interface CommunityTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFiles: (files: File[]) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

const entryDetails = (entry: TemplateEntry): string =>
  [entry.game, entry.images === null ? null : `${entry.images} ${entry.images === 1 ? 'image' : 'images'}`, entry.author === null ? null : `by ${entry.author}`]
    .filter((part): part is string => part !== null)
    .join(' · ');

const matches = (entry: TemplateEntry, search: string): boolean =>
  search === '' || [entry.title, entry.game, entry.author].some((value) => value !== null && value.toLowerCase().includes(search));

const skippedNote = (count: number): string =>
  `${count} ${count === 1 ? 'entry was' : 'entries were'} skipped: ${count === 1 ? 'it does' : 'they do'} not follow the index rules.`;

const CommunityTemplates: React.FC<CommunityTemplatesProps> = ({open, onOpenChange, onOpenFiles, onCloseAutoFocus}) => {
  const {urls, results, refresh, check, add, remove} = useTemplateIndices(open);
  const [search, setSearch] = useState('');
  const [address, setAddress] = useState('');
  const [checking, setChecking] = useState(false);
  const [candidate, setCandidate] = useState<LoadedTemplateIndex | null>(null);
  const [addMessage, setAddMessage] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [openMessage, setOpenMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const addressField = useRef<HTMLInputElement>(null);
  const baseId = useId();

  useEffect(() => {
    if (open) return;
    request.current?.abort();
    request.current = null;
  }, [open]);

  useEffect(() => () => request.current?.abort(), []);

  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () => urls.map((url) => {
      const result = results.get(url);
      return {url, result, templates: result?.ok ? result.index.templates.filter((entry) => matches(entry, needle)) : []};
    }),
    [urls, results, needle],
  );

  const started = (): AbortController => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return controller;
  };

  const handleCheck = async (event: React.FormEvent) => {
    event.preventDefault();
    if (checking || opening !== null) return;
    const controller = started();
    setCandidate(null);
    setAddMessage('');
    setChecking(true);
    const result = await check(address.trim(), controller.signal);
    if (controller.signal.aborted) return;
    setChecking(false);
    if (!result.ok) setAddMessage(LOAD_INDEX_MESSAGES[result.reason]);
    else if (urls.includes(result.url)) setAddMessage(ADD_INDEX_MESSAGES.listed);
    else if (urls.length >= MAX_TEMPLATE_INDICES) setAddMessage(ADD_INDEX_MESSAGES.full);
    else setCandidate(result);
  };

  const handleAdd = () => {
    if (candidate === null) return;
    const result = add(candidate);
    if (!result.ok) {
      setAddMessage(ADD_INDEX_MESSAGES[result.reason]);
      return;
    }
    setCandidate(null);
    setAddress('');
    setAddMessage('');
    addressField.current?.focus();
  };

  const handleRemove = (url: string) => {
    remove(url);
    addressField.current?.focus();
  };

  const handleAddressChange = (value: string) => {
    if (checking) {
      request.current?.abort();
      request.current = null;
      setChecking(false);
    }
    setAddress(value);
    setCandidate(null);
    setAddMessage('');
  };

  const handleOpen = async (entry: TemplateEntry) => {
    if (opening !== null) return;
    const controller = started();
    setChecking(false);
    setOpenMessage('');
    setOpening(entry.title);
    try {
      const fetched = await fetchTemplateFile(entry, {signal: controller.signal});
      if (controller.signal.aborted) return;
      if (!fetched.ok) {
        setOpenMessage(TEMPLATE_FILE_MESSAGES[fetched.reason]);
        return;
      }
      const file = new File([fetched.bytes as Uint8Array<ArrayBuffer>], `${entry.id}.png`, {type: 'image/png'});
      const checked = await checkFile(file);
      if (controller.signal.aborted) return;
      if (checked.kind !== 'snapshot') {
        setOpenMessage(checked.kind === 'message' ? checked.message : TEMPLATE_WITHOUT_LIST);
        return;
      }
      handleOpenChange(false);
      onOpenFiles([file]);
    } catch {
      if (!controller.signal.aborted) setOpenMessage(TEMPLATE_FILE_MESSAGES.unchecked);
    } finally {
      if (!controller.signal.aborted) setOpening(null);
    }
  };

  const cancelOpening = () => {
    request.current?.abort();
    request.current = null;
    setOpening(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setOpening(null);
      setChecking(false);
      setCandidate(null);
      setOpenMessage('');
      setAddMessage('');
      setSearch('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col gap-4" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Community templates</DialogTitle>
          <DialogDescription>
            Lists that other people made. A template opens as a new list, and your current list stays one Back step away.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {urls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not added an index yet. An index is a list of templates that somebody maintains on GitHub. Paste
              its address below.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="search"
                aria-label="Search templates"
                placeholder="Search templates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={refresh}>Refresh</Button>
            </div>
          )}

          {opening !== null && (
            <p role="status" className="flex items-center justify-between gap-2 text-sm">
              <span>Getting “{opening}”…</span>
              <Button type="button" size="sm" variant="outline" onClick={cancelOpening}>Cancel</Button>
            </p>
          )}
          {openMessage !== '' && <p role="alert" className="text-sm text-destructive">{openMessage}</p>}

          {shown.map(({url, result, templates}, indexNumber) => (
            <section key={url} aria-label={`Templates listed by ${result?.ok ? result.source : url}`} className="flex flex-col gap-1.5">
              {result === undefined && <p role="status" className="text-sm text-muted-foreground">Loading {url}…</p>}
              {result !== undefined && !result.ok && (
                <p role="alert" className="text-sm text-destructive">
                  {url}: {LOAD_INDEX_MESSAGES[result.reason]}
                </p>
              )}
              {result?.ok && (
                <>
                  <h3 className="text-sm font-semibold">
                    {result.index.name}{' '}
                    <span className="font-normal text-muted-foreground">listed by {result.source}</span>
                  </h3>
                  {result.index.contact !== null && (
                    <p className="text-xs text-muted-foreground">Report a template: {result.index.contact}</p>
                  )}
                  {result.skipped > 0 && <p className="text-xs text-muted-foreground">{skippedNote(result.skipped)}</p>}
                  {result.index.templates.length === 0 && (
                    <p className="text-sm text-muted-foreground">This index does not list any template yet.</p>
                  )}
                  {result.index.templates.length > 0 && templates.length === 0 && (
                    <p className="text-sm text-muted-foreground">No template of this index matches your search.</p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {templates.map((entry) => {
                      const detailsId = `${baseId}-${indexNumber}-${entry.id}`;
                      const details = entryDetails(entry);
                      return (
                        <li key={entry.id} className="flex flex-col">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto justify-start px-2 py-1.5 text-left whitespace-normal"
                            aria-describedby={details === '' ? undefined : detailsId}
                            disabled={opening !== null}
                            onClick={() => void handleOpen(entry)}
                          >
                            {entry.title}
                          </Button>
                          {details !== '' && <span id={detailsId} className="px-2 text-xs text-muted-foreground">{details}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          ))}

          <section aria-label="Your indices" className="flex flex-col gap-2 border-t pt-3">
            <h3 className="text-sm font-semibold">Your indices</h3>
            {urls.length > 0 && (
              <ul className="flex flex-col gap-1">
                {urls.map((url) => {
                  const result = results.get(url);
                  const source = result?.ok ? result.source : url;
                  return (
                    <li key={url} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 break-all">{result?.ok ? `${result.index.name} (${result.source})` : url}</span>
                      <Button type="button" size="sm" variant="outline" aria-label={`Remove the index ${source}`} onClick={() => handleRemove(url)}>
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <form aria-label="Add an index" className="flex flex-col gap-2" onSubmit={(event) => void handleCheck(event)}>
              <Label htmlFor={`${baseId}-address`}>Index address</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${baseId}-address`}
                  ref={addressField}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://raw.githubusercontent.com/…/index.json"
                  value={address}
                  onChange={(event) => handleAddressChange(event.target.value)}
                />
                <Button type="submit" variant="outline" disabled={address.trim() === '' || checking || opening !== null}>
                  {checking ? 'Checking…' : 'Check index'}
                </Button>
              </div>
            </form>
            {addMessage !== '' && <p role="alert" className="text-sm text-destructive">{addMessage}</p>}
            {candidate !== null && (
              <div role="group" aria-label="Index to add" className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <p>
                  <span className="font-semibold">{candidate.index.name}</span>{' '}
                  <span className="text-muted-foreground">listed by {candidate.source}</span>
                </p>
                <p>
                  {candidate.index.templates.length} {candidate.index.templates.length === 1 ? 'template' : 'templates'}
                  {candidate.index.maintainer !== null && `, maintained by ${candidate.index.maintainer}`}
                </p>
                {candidate.skipped > 0 && <p className="text-muted-foreground">{skippedNote(candidate.skipped)}</p>}
                <p>{TEMPLATE_INDEX_NOTICE}</p>
                <div className="flex gap-2">
                  <Button type="button" onClick={handleAdd}>Add index</Button>
                  <Button type="button" variant="outline" onClick={() => setCandidate(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommunityTemplates;
