'use client';

import React, {useState} from 'react';
import Link from 'next/link';

type IntentLinkProps = Omit<React.ComponentProps<typeof Link>, 'prefetch'>;

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
