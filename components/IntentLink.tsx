'use client';

import React, {useState} from 'react';
import Link from 'next/link';

type IntentLinkProps = Omit<React.ComponentProps<typeof Link>, 'prefetch'>;

/**
 * A link that loads its page ahead only once the visitor shows they may follow it: the pointer
 * on it, keyboard focus, or a finger on it. Next.js would otherwise load every link's page as
 * soon as the link is on screen, which on Home is every template. After the intent it behaves
 * as a plain next/link (prefetch on). The visitor sees no difference, other than a page that
 * opens as fast.
 */
export function IntentLink({onPointerEnter, onFocus, onTouchStart, ...props}: IntentLinkProps) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
