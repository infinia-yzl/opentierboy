'use client';

import React from 'react';
import Link from 'next/link';
import {toast} from 'sonner';
import {Cross2Icon, DrawingPinFilledIcon, DrawingPinIcon} from '@radix-ui/react-icons';
import {Button} from '@/components/ui/button';
import {useRecentLinks} from '@/components/useRecentLinks';
import {RECENT_PIN_LIMIT, recentLinkHref, recentLinkKey, type RecentLink} from '@/lib/recent/recentLinks';
import {rankPageTitle, type RankPageNames} from '@/lib/rankPath';

interface RecentlyViewedProps {
  /** Display names of the editor pages, for links without a title (lib/imageSets.ts: rankPageNames). */
  pageNames: RankPageNames;
}

/**
 * The landing page's "Recently viewed" section: tier list links this browser opened, pinned
 * ones first, with pin, unpin and remove. Hidden while the list is empty. The list stays in
 * this browser (local storage), so a one-line hint suggests bookmarks.
 */
const RecentlyViewed: React.FC<RecentlyViewedProps> = ({pageNames}) => {
  const {links, pin, unpin, remove} = useRecentLinks();
  if (links.length === 0) return null;

  const togglePin = (link: RecentLink) => {
    if (link.pinned) {
      unpin(link);
      return;
    }
    const result = pin(link);
    if (!result.ok && result.reason === 'pin-limit') {
      toast(`You can pin up to ${RECENT_PIN_LIMIT} lists`, {description: 'Unpin a list to pin another one.'});
    }
  };

  return (
    <section aria-labelledby="recently-viewed" className="mt-12">
      <h2 id="recently-viewed" className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
        Recently viewed
      </h2>
      <p className="pb-4 text-sm text-muted-foreground">
        These lists are kept in this browser only. Bookmark a list to keep it anywhere.
      </p>
      <ul className="divide-y rounded-md border">
        {links.map((link) => {
          const name = link.title.trim() || rankPageTitle(link.path, pageNames);
          return (
            <li key={recentLinkKey(link)} className="flex items-center gap-2 px-3 py-1">
              <Link href={recentLinkHref(link)} prefetch={false} className="min-w-0 grow truncate py-1 hover:underline">
                {name}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Pin ${name}`}
                aria-pressed={link.pinned}
                onClick={() => togglePin(link)}
              >
                {link.pinned ? <DrawingPinFilledIcon className="h-4 w-4"/> : <DrawingPinIcon className="h-4 w-4"/>}
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={() => remove(link)}>
                <Cross2Icon className="h-4 w-4"/>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default RecentlyViewed;
