import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {GearIcon, MinusIcon, PlusIcon} from "@radix-ui/react-icons";
import {useTierContext} from '@/contexts/TierContext';
import {LabelPosition, TierTemplate, tierTemplates} from "@/models/Tier";
import {canAddTier, canRemoveTier} from "@/lib/dnd/moves";
import {tierLabel} from "@/lib/dnd/labels";

const TierTemplateSelector: React.FC = () => {
  const {
    tiers,
    labelPosition,
    showLabels,
    setLabelPosition,
    toggleLabels,
    onTemplateChange,
    removeTier,
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
        <Button variant="outline" size="icon" title="Row options">
          <GearIcon className="h-4 w-4"/>
          <span className="sr-only">Row options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Number of Rows</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={rowCount} onValueChange={handleRowCountChange}>
          <DropdownMenuRadioItem value="3rows">3 Rows</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="5rows">5 Rows</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="7rows">7 Rows</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {/* Manual rows (#182): remove a ranked row (its items go to Unranked). "Add row" is the
            button beside this menu (RowControls). */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canRemoveTier(tiers, 0)} className="relative pl-8 data-disabled:pointer-events-none data-disabled:opacity-50">
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
              <MinusIcon className="h-4 w-4"/>
            </span>
            Remove a row
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {tiers.slice(0, -1).map((tier, index) => (
                <DropdownMenuItem key={tier.id} onSelect={() => removeTier(tier.id)}>
                  {tierLabel(tiers, index)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
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

/**
 * Under the rows: "Add row" (a new row above Unranked, #182) and the Row options menu beside it
 * (owner decision, 2026-10-28: rows are changed where they are, and the toolbar keeps three
 * buttons). Hidden in Zen, which turns off editing.
 */
export const RowControls: React.FC = () => {
  const {tiers, addTier} = useTierContext();
  return (
    <div className="w-full flex gap-2 mt-2 hide-in-zen" data-html2canvas-ignore>
      <Button variant="outline" className="flex-1 gap-2 border-dashed text-muted-foreground" onClick={() => addTier()} disabled={!canAddTier(tiers)}>
        <PlusIcon className="h-4 w-4"/>
        Add row
      </Button>
      <TierTemplateSelector/>
    </div>
  );
};
