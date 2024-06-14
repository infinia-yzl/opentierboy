import DragDropTierList from '../components/DragDropTierList';

interface Item {
  id: string;
  content: string;
}

interface Tier {
  id: string;
  name: string;
  items: Item[];
  labelPosition?: 'top' | 'left' | 'right';
}

// TODO: Items should have their own sets and can be appended / merged, or added on the fly
const getItems = (count: number): Item[] =>
  Array.from({ length: count }, (v, k) => k).map((k) => ({
    id: `item-${k}`,
    content: `item ${k}`,
  }));

// TODO: Tiers should have their own templates and can be loaded separate from the items
const getInitialTiers = (): Tier[] => [
  { id: 'tier-ss', name: 'SS', items: [], labelPosition: 'top' },
  { id: 'tier-s', name: 'S', items: [], labelPosition: 'left' },
  { id: 'tier-a', name: 'A', items: [], labelPosition: 'right' },
  { id: 'tier-b', name: 'B', items: [] },
  { id: 'tier-c', name: 'C', items: getItems(6) },
];

const Home = async () => {
  const initialTiers = getInitialTiers(); // Simulating a data fetch

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 ">
      <h1 className="text-3xl mb-8">Tier Author</h1>
      <div>
        <DragDropTierList initialTiers={initialTiers} />
      </div>
    </main>
  );
};

export default Home;
