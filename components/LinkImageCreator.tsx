"use client";

import React, {useEffect, useId, useRef, useState} from 'react';
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import Item from "@/models/Item";
import {useCustomImages} from "@/contexts/CustomImagesContext";
import {checkLinkImageUrl} from "@/lib/images/linkImage";
import {checkImage, labelFallback} from "@/lib/images/imageCheck";
import {IMAGE_CHECK_FAILURE_MESSAGES, LINK_IMAGE_REFUSAL_MESSAGES} from "@/lib/images/messages";

interface LinkImageCreatorProps {
  onItemsCreate: (items: Item[]) => void;
}

/**
 * "From a link" (#107): checks the address (lib/images/linkImage.ts), loads the image once to
 * check it (lib/images/imageCheck.ts), and adds it as a link image item. The list stores the
 * address and the label; the image always loads from its own site, never through this server.
 * An image that does not load can still be added: it shows as a label tile.
 */
const LinkImageCreator: React.FC<LinkImageCreatorProps> = ({onItemsCreate}) => {
  const {allowHosts} = useCustomImages();
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  // The address whose image failed its check: the next submit adds it anyway.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ids = useId();

  useEffect(() => () => abort.current?.abort(), []);

  const add = (url: string, host: string, label: string) => {
    // The visitor chose this site, so its images may load on this page.
    allowHosts([host]);
    onItemsCreate([{id: url, content: label, source: 'link', url}]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const check = checkLinkImageUrl(address);
    if (!check.ok) {
      setMessage(LINK_IMAGE_REFUSAL_MESSAGES[check.reason]);
      setFailedUrl(null);
      return;
    }
    const label = name.trim() || labelFallback(check.url).text || check.displayDomain;
    if (failedUrl === check.url) {
      add(check.url, check.host, label);
      return;
    }
    setMessage('');
    setIsChecking(true);
    abort.current?.abort();
    abort.current = new AbortController();
    const result = await checkImage(check.url, {label, signal: abort.current.signal});
    setIsChecking(false);
    if (result.ok) {
      add(check.url, check.host, label);
      return;
    }
    if (result.reason === 'aborted') return;
    setFailedUrl(check.url);
    setMessage(`${IMAGE_CHECK_FAILURE_MESSAGES[result.reason]} You can add it anyway: it shows as a label tile until the image loads.`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-address`}>Image address</Label>
        <Input
          id={`${ids}-address`}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://"
          value={address}
          aria-describedby={message ? `${ids}-message` : undefined}
          aria-invalid={message !== '' && failedUrl === null ? true : undefined}
          onChange={(event) => {
            setAddress(event.target.value);
            setFailedUrl(null);
            setMessage('');
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-name`}>Name (optional)</Label>
        <Input
          id={`${ids}-name`}
          type="text"
          placeholder="Item name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {message && (
        <p id={`${ids}-message`} role="alert" className="text-sm text-destructive">{message}</p>
      )}
      <div>
        <Button type="submit" disabled={isChecking || address.trim() === ''}>
          {isChecking ? 'Checking the image…' : failedUrl ? 'Add Anyway' : 'Add Item'}
        </Button>
      </div>
    </form>
  );
};

export default LinkImageCreator;
