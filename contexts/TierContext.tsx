import React from 'react';
import Tier, {LabelPosition} from "@/models/Tier";
import TierCortex from "@/lib/TierCortex";

export interface TierContext {
  tierCortex: TierCortex;
  tiers: Tier[];
  labelPosition: LabelPosition;
  showLabels: boolean;
  setLabelPosition: (position: LabelPosition) => void;
  toggleLabels: () => void;
  onTemplateChange: (template: Tier[]) => void;
}

export const TierContext = React.createContext<TierContext | undefined>(undefined);

export const useTierContext = () => {
  const context = React.useContext(TierContext);
  if (context === undefined) {
    throw new Error('useTierContext must be used within a TierContextProvider');
  }
  return context;
}
