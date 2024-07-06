import React from 'react';
import Tier, {LabelPosition} from "@/models/Tier";

export interface TierContextType {
  tiers: Tier[];
  labelPosition: LabelPosition;
  showLabels: boolean;
  setLabelPosition: (position: LabelPosition) => void;
  toggleLabels: () => void;
  onTemplateChange: (template: Tier[]) => void;
}

export const TierContext = React.createContext<TierContextType | undefined>(undefined);

export const useTierContext = () => {
  const context = React.useContext(TierContext);
  if (context === undefined) {
    throw new Error('useTierContext must be used within a TierContextProvider');
  }
  return context;
}
