import React, {useMemo, useState} from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ItemSet} from "@/models/ItemSet";
import {Button} from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {ChevronLeftIcon, SlashIcon} from "@radix-ui/react-icons";
import {useCommandState} from 'cmdk';

interface ItemSetSelectorProps {
  itemSets: ItemSet[];
  onSelectItemSet: (packageName: string, tagName: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
}

interface PackageData {
  displayName: string;
  sets: ItemSet[];
}

type OrganizedItemSet = [string, PackageData];

interface SubItemProps extends React.ComponentPropsWithoutRef<typeof CommandItem> {
  packageDisplayName: string;
}

const SubItem: React.FC<SubItemProps> = ({packageDisplayName, ...props}) => {
  const search = useCommandState((state) => state.search);
  if (!search) return null;
  return (
    <CommandItem {...props}>
      <div className="flex flex-col">
        <span>{props.children}</span>
        <span className="text-xs text-muted-foreground">
          {packageDisplayName}
        </span>
      </div>
    </CommandItem>
  );
};

const ItemSetSelector: React.FC<ItemSetSelectorProps> = ({
  itemSets,
  onSelectItemSet,
  open,
  onOpenChange,
  isLoading
}) => {
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<string[]>(['root']);
  const page = pages[pages.length - 1];

  const organizedItemSets = useMemo<OrganizedItemSet[]>(() => {
    const grouped = itemSets.reduce((acc, itemSet) => {
      if (!acc[itemSet.packageName]) {
        acc[itemSet.packageName] = {
          displayName: itemSet.packageDisplayName,
          sets: []
        };
      }
      acc[itemSet.packageName].sets.push(itemSet);
      return acc;
    }, {} as Record<string, PackageData>);

    return Object.entries(grouped).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName));
  }, [itemSets]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !search && pages.length > 1) {
      e.preventDefault();
      setPages((prevPages) => prevPages.slice(0, -1));
    }
  };

  const goBack = () => {
    if (pages.length > 1) {
      setPages((prevPages) => prevPages.slice(0, -1));
    }
  };

  const renderBreadcrumbs = () => {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          {pages.map((pageName, index) => (
            <React.Fragment key={pageName}>
              {index > 0 && <BreadcrumbSeparator><SlashIcon/></BreadcrumbSeparator>}
              <BreadcrumbItem className="hover:cursor-pointer">
                {index === pages.length - 1 ? (
                  <BreadcrumbPage>
                    {pageName === 'root' ? 'Games' : pageName}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink onClick={() => setPages(pages.slice(0, index + 1))}>
                    {pageName === 'root' ? 'Games' : pageName}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col">
        {pages.length > 1 && (
          <div className="flex items-center px-1 pt-1">
            <Button variant="ghost" size="icon" onClick={goBack} className="mr-2 flex-shrink-0">
              <ChevronLeftIcon className="h-6 w-6"/>
            </Button>
            {renderBreadcrumbs()}
          </div>
        )}
        <CommandInput
          placeholder="Search games and asset types..."
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleKeyDown}
        />
        <div className="text-[10px] text-muted-foreground px-4 pt-1 pb-2 tooltip-mouse">
          Press Escape to close. Backspace to go back while typing.
        </div>
        <CommandList>
          <CommandEmpty>No games or asset types found.</CommandEmpty>
          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                Loading games...
              </div>
            ) : page === 'root' ? (
              <CommandGroup heading="Games">
                {organizedItemSets.map(([packageName, packageData]) => (
                  <React.Fragment key={packageName}>
                    <CommandItem onSelect={() => setPages([...pages, packageName])}>
                      {packageData.displayName}
                    </CommandItem>
                    {packageData.sets.map((itemSet) => (
                      <SubItem
                        key={`${packageName}-${itemSet.tagName}`}
                        value={`${packageName}-${itemSet.tagName}`}
                        onSelect={() => onSelectItemSet(packageName, itemSet.tagName)}
                        packageDisplayName={packageData.displayName}
                      >
                        {itemSet.tagTitle}
                      </SubItem>
                    ))}
                  </React.Fragment>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup heading={organizedItemSets.find(([name]) => name === page)?.[1].displayName || ''}>
                {organizedItemSets
                  .find(([name]) => name === page)?.[1].sets
                  .sort((a, b) => a.tagTitle.localeCompare(b.tagTitle))
                  .map((itemSet) => (
                    <CommandItem
                      key={`${page}-${itemSet.tagName}`}
                      onSelect={() => onSelectItemSet(page, itemSet.tagName)}
                    >
                      {itemSet.tagTitle}
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </ScrollArea>
        </CommandList>
      </div>
    </CommandDialog>
  );
};

export default ItemSetSelector;
