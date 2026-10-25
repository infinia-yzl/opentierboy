"use client";

import React from 'react';
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {useCustomImages, useHostsAwaitingConsent} from "@/contexts/CustomImagesContext";

/**
 * Shown when the list holds images from sites that are neither trusted
 * (trusted-image-sites.json) nor allowed by this visitor. Nothing loads from those sites until
 * the visitor chooses [Load] (this page) or [Always allow these sites] (kept in this browser).
 * Until then their items show as label tiles.
 */
const LinkImageNotice: React.FC = () => {
  const {allowHosts} = useCustomImages();
  const hostsAwaitingConsent = useHostsAwaitingConsent();
  if (hostsAwaitingConsent.length === 0) return null;

  return (
    <Alert role="region" aria-label="Images from other sites" className="max-w-2xl mx-auto my-2" data-html2canvas-ignore>
      <AlertTitle>Images from other sites</AlertTitle>
      <AlertDescription>
        <p>
          This list has images from {hostsAwaitingConsent.length === 1 ? 'a site' : 'sites'} that OpenTierBoy does not
          know. Loading them lets {hostsAwaitingConsent.length === 1 ? 'that site' : 'those sites'} see that you opened
          this list.
        </p>
        <ul className="list-disc list-inside my-1">
          {hostsAwaitingConsent.map((host) => <li key={host}>{host}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2 mt-1">
          <Button size="sm" onClick={() => allowHosts(hostsAwaitingConsent)}>Load</Button>
          <Button size="sm" variant="outline" onClick={() => allowHosts(hostsAwaitingConsent, {remember: true})}>
            Always allow these sites
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default LinkImageNotice;
