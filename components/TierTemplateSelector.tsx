import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {LayersIcon} from "@radix-ui/react-icons";
import {useTierContext} from '@/contexts/TierContext';
import {LabelPosition, TierTemplate, tierTemplates} from "@/models/Tier";

const TierTemplateSelector: React.FC = () => {
  const {
    tiers,
    labelPosition,
    showLabels,
    setLabelPosition,
    toggleLabels,
    onTemplateChange
  } = useTierContext();

  const rowCount = `${tiers.length - 1}rows`;

  const handleRowCountChange = (value: string) => {
    const newTemplate = tierTemplates[value as keyof TierTemplate];
    onTemplateChange(newTemplate);  // Use onTemplateChange from context
  };

  const handleLabelPositionChange = (position: string) => {
    setLabelPosition(position as LabelPosition);
  };

  const handleLabelVisibilityChange = (visibility: string) => {
    if ((visibility === 'show' && !showLabels) || (visibility === 'hide' && showLabels)) {
      toggleLabels();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <LayersIcon className="h-[1.2rem] w-[1.2rem]"/>
          <span className="sr-only">Select rows and label options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Number of Rows</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={rowCount} onValueChange={handleRowCountChange}>
          <DropdownMenuRadioItem value="3rows">3 Rows</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="5rows">5 Rows</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="7rows">7 Rows</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator/>
        <DropdownMenuLabel>Label Position</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={labelPosition} onValueChange={handleLabelPositionChange}>
          <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator/>
        <DropdownMenuLabel>Image Label</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={showLabels ? 'show' : 'hide'} onValueChange={handleLabelVisibilityChange}>
          <DropdownMenuRadioItem value="show">Show Labels</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="hide">Hide Labels</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TierTemplateSelector;
