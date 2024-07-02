import {ItemProps} from "@/components/Item";
import {ThemeToggle} from "@/components/ThemeToggle";
import TierListManager from "@/components/TierListManager";
import {ItemLabelToggle} from "@/components/ItemLabelToggle";
import {ZenToggle} from "@/components/ZenToggle";

export interface Tier {
  id: string;
  name: string;
  items: ItemProps[];
  labelPosition?: 'top' | 'left' | 'right';
}

// TODO: Items should have their own sets and can be appended / merged, or added on the fly
const getItems = (count: number): ItemProps[] =>
  Array.from({length: count}, (v, k) => k).map((k) => ({
    id: `item-${k}`,
    content: `item ${k}`,
  }));

// TODO: Tiers should have their own templates and can be loaded separate from the items
const getInitialTiers = (): Tier[] => [
  {id: 'tier-ss', name: 'SS', items: [], labelPosition: 'top'},
  {id: 'tier-s', name: 'S', items: [], labelPosition: 'left'},
  {id: 'tier-a', name: 'A', items: [], labelPosition: 'right'},
  {id: 'tier-b', name: 'B', items: []},
  {id: 'tier-c', name: 'C', items: []},
  {id: 'uncategorized', name: '', items: getItems(8)},
];

const Home = async () => {
  const initialTiers = getInitialTiers(); // Simulating a data fetch

  return (
    <main className="flex flex-col items-center justify-between">
      <h1 className="text-3xl p-12">Tier Author <ThemeToggle/></h1>
      <TierListManager initialTiers={initialTiers}>
        <div className="flex flex-auto space-x-2">
          <ZenToggle/>
          <ItemLabelToggle/>
        </div>
      </TierListManager>
    </main>
  );
};

export default Home;
