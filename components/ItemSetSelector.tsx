import React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {ScrollArea} from "@/components/ui/scroll-area";

interface ItemSet {
  packageName: string;
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
      acc[itemSet.packageName] = [];
    }
    acc[itemSet.packageName].push(itemSet);
    return acc;
  }, {} as Record<string, ItemSet[]>);

  return (
    <Command>
      <CommandInput placeholder="Search item templates..."/>
      <CommandEmpty>No item templates found.</CommandEmpty>
      <CommandList>
        <ScrollArea className="h-[300px]">
          {Object.entries(groupedItemSets).map(([packageName, sets]) => (
            <CommandGroup key={packageName} heading={packageName}>
              {sets.map((itemSet) => (
                <CommandItem
                  key={`${itemSet.packageName}-${itemSet.tagName}`}
                  value={`${itemSet.packageName}-${itemSet.tagTitle}`}
                  onSelect={() => {
                    onSelectItemSet(itemSet.packageName, itemSet.tagName, itemSet.images);
                  }}
                >
                  {itemSet.tagTitle} ({itemSet.images.length} items)
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
