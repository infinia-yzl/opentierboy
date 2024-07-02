import React from 'react';
import {Tier} from "@/app/page";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {LayersIcon} from "@radix-ui/react-icons";

type TierTemplate = Record<string, Tier[]>;

const tierTemplates: TierTemplate = {
  '3rows': [
    {id: 'tier-s', name: 'S', items: []},
    {id: 'tier-a', name: 'A', items: []},
    {id: 'tier-b', name: 'B', items: []},
  ],
  '5rows': [
    {id: 'tier-s', name: 'S', items: []},
    {id: 'tier-a', name: 'A', items: []},
    {id: 'tier-b', name: 'B', items: []},
    {id: 'tier-c', name: 'C', items: []},
    {id: 'tier-f', name: 'F', items: []},
  ],
  '7rows': [
    {id: 'tier-ss', name: 'SS', items: []},
    {id: 'tier-s', name: 'S', items: []},
    {id: 'tier-a', name: 'A', items: []},
    {id: 'tier-b', name: 'B', items: []},
    {id: 'tier-c', name: 'C', items: []},
    {id: 'tier-d', name: 'D', items: []},
    {id: 'tier-f', name: 'F', items: []},
  ],
};

interface TierTemplateSelectorProps {
  onTemplateChange: (template: Tier[]) => void;
}

const TierTemplateSelector: React.FC<TierTemplateSelectorProps> = ({onTemplateChange}) => {
  const handleTemplateChange = (value: keyof TierTemplate) => {
    onTemplateChange(tierTemplates[value]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <LayersIcon className="h-[1.2rem] w-[1.2rem]"/>
          <span className="sr-only">Select rows</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleTemplateChange('3rows')}>
          3 Rows
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTemplateChange('5rows')}>
          5 Rows
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTemplateChange('7rows')}>
          7 Rows
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TierTemplateSelector;
