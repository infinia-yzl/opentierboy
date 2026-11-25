import React from 'react';

export const SCRIBBLE_ICON_PATH = 'M3 17c2-7 4.5-11 6.5-10 2.4 1.2-3 9.5 0 10 2.8.5 3.5-7.5 6-7 2 .4.2 5.6 2.2 6 1.2.2 2.2-.8 3.3-2';

export function ScribbleIcon({className, 'aria-hidden': ariaHidden = true}: {className?: string; 'aria-hidden'?: boolean}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className={className}
    >
      <path d={SCRIBBLE_ICON_PATH}/>
    </svg>
  );
}
