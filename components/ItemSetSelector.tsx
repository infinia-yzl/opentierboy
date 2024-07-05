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
  images: string[];
}

interface ItemSetSelectorProps {
  itemSets: ItemSet[];
  onSelectItemSet: (packageName: string, images: string[]) => void;
}

const ItemSetSelector: React.FC<ItemSetSelectorProps> = ({itemSets, onSelectItemSet}) => {

  return (
    <Command>
      <CommandInput placeholder="Search item templates..."/>
      <CommandEmpty>No item templates found.</CommandEmpty>
      <CommandList>
        <CommandGroup heading="Suggestions">
          <ScrollArea className="h-[200px]">
            {itemSets.map((item) => (
              <CommandItem
                key={item.packageName}
                value={item.packageName}
                onSelect={() => {
                  onSelectItemSet(item.packageName, item.images);
                }}
              >
                {item.packageName}
              </CommandItem>
            ))}
          </ScrollArea>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default ItemSetSelector;
