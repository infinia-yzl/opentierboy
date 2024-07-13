'use client';

import {useState, useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import {ItemSet} from "@/models/ItemSet";
import Tier from "@/models/Tier";
import {
  decodeTierStateFromURL, getInitialTiers,
} from '@/lib/tierStateUtils';
import dynamic from "next/dynamic";

const TierListManager = dynamic(() => import('./TierListManager'), {ssr: false});

interface ClientTierListManagerProps {
  initialItemSet?: ItemSet;
  initialState?: string;
  title?: string;
}

export default function ClientTierListManager({initialItemSet, initialState, title}: ClientTierListManagerProps) {
  const searchParams = useSearchParams();

  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    getInitialTiers(initialState, initialItemSet).then(setTiers)
  }, [initialItemSet, initialState]);

  useEffect(() => {
    const state = searchParams.get('state');
    if (state) {
      decodeTierStateFromURL(state).then((decodedState) => {
          if (decodedState) setTiers(decodedState);
        }
      );
    }
  }, [searchParams]);

  return <TierListManager tiers={tiers} onTiersUpdate={setTiers} title={title}/>;
}
