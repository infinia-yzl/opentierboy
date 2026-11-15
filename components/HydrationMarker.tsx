'use client';

import {useEffect} from 'react';

export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}
