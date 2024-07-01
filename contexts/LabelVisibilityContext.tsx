"use client";

import React from 'react';

interface LabelVisibilityContextType {
  showLabels: boolean;
  toggleLabels: () => void;
}

export const LabelVisibilityContext = React.createContext<LabelVisibilityContextType | undefined>(undefined);

export const useLabelVisibility = () => {
  const context = React.useContext(LabelVisibilityContext);
  if (context === undefined) {
    throw new Error('useLabelVisibility must be used within a LabelVisibilityProvider');
  }
  return context;
};
