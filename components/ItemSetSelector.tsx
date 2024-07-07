import React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList, CommandShortcut,
} from "@/components/ui/command";
import {ScrollArea} from "@/components/ui/scroll-area";

interface ItemSet {
  packageName: string;
  packageDisplayName: string;
  tagName: string;
  tagTitle: string;
  images: string[];
}

interface ItemSetSelectorProps {
  itemSets: ItemSet[];
  onSelectItemSet: (packageName: string, tagName: string, images: string[]) => void;
}

const ItemSetSelector: React.FC<ItemSetSelectorProps> = ({itemSets, onSelectItemSet}) => {
  // Group item sets by package name
  const groupedItemSets = itemSets.reduce((acc, itemSet) => {
    if (!acc[itemSet.packageName]) {
      acc[itemSet.packageName] = {
        displayName: itemSet.packageDisplayName,
        sets: []
      };
    }
    acc[itemSet.packageName].sets.push(itemSet);
    return acc;
  }, {} as Record<string, { displayName: string; sets: ItemSet[] }>);

  return (
    <Command>
      <CommandInput placeholder="Search"/>
      <CommandEmpty>No item templates found.</CommandEmpty>
      <CommandList>
        <ScrollArea className="h-[300px]">
          {Object.entries(groupedItemSets).map(([packageName, {displayName, sets}]) => (
            <CommandGroup key={packageName} heading={displayName}>
              {sets.map((itemSet) => (
                <CommandItem
                  key={`${itemSet.packageName}-${itemSet.tagName}`}
                  value={`${itemSet.packageDisplayName}-${itemSet.tagTitle}`}
                  onSelect={() => {
                    onSelectItemSet(itemSet.packageName, itemSet.tagName, itemSet.images);
                  }}
                >
                  {itemSet.tagTitle}
                  <CommandShortcut>({itemSet.images.length})</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </ScrollArea>
      </CommandList>
    </Command>
  );
};

export default ItemSetSelector;
