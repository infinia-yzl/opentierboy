'use client';

import React from 'react';
import Link from 'next/link';
import {toast} from 'sonner';
import {Cross2Icon, DrawingPinFilledIcon, DrawingPinIcon} from '@radix-ui/react-icons';
import {Button} from '@/components/ui/button';
import {useRecentLinks} from '@/components/useRecentLinks';
import {RECENT_PIN_LIMIT, recentLinkHref, recentLinkKey, type RecentLink} from '@/lib/recent/recentLinks';
import {rankPageTitle, type RankPageNames} from '@/lib/rankPath';
import {cn} from '@/lib/utils';

interface RecentlyViewedProps {
  /** Display names of the editor pages, for links without a title (lib/imageSets.ts: rankPageNames). */
  pageNames: RankPageNames;
}

/**
 * The landing page's "Recently viewed" section: tier list links this browser opened, pinned
 * ones first, with pin, unpin and remove. Hidden while the list is empty. The list stays in
 * this browser (local storage), so a one-line hint suggests bookmarks (HomeFinal board).
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
    <section aria-labelledby="recently-viewed" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="recently-viewed" className="text-[22px] font-black md:text-2xl">
          Recently viewed
        </h2>
        <p className="text-sm text-muted-foreground">
          Lists you opened in this browser. Bookmark one to open it anywhere.
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {links.map((link) => {
          const name = link.title.trim() || rankPageTitle(link.path, pageNames);
          return (
            <li key={recentLinkKey(link)} className="flex h-12 items-center gap-1 pl-4 pr-1.5">
              <Link href={recentLinkHref(link)} prefetch={false} className="min-w-0 grow truncate text-[15px] hover:underline">
                {name}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Pin ${name}`}
                aria-pressed={link.pinned}
                className={cn('shrink-0', !link.pinned && 'text-muted-foreground')}
                onClick={() => togglePin(link)}
              >
                {link.pinned ? <DrawingPinFilledIcon className="h-4 w-4"/> : <DrawingPinIcon className="h-4 w-4"/>}
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} className="shrink-0 text-muted-foreground" onClick={() => remove(link)}>
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
