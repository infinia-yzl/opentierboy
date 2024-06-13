// app/page.tsx

import DragDropTierList from '../components/DragDropTierList';

interface Item {
  id: string;
  content: string;
}

interface Tier {
  id: string;
  name: string;
  items: Item[];
}

const getItems = (count: number): Item[] =>
  Array.from({ length: count }, (v, k) => k).map((k) => ({
    id: `item-${k}`,
    content: `item ${k}`,
  }));

const getInitialTiers = (): Tier[] => [
  { id: 'tier-ss', name: 'SS', items: [] },
  { id: 'tier-s', name: 'S', items: [] },
  { id: 'tier-a', name: 'A', items: [] },
  { id: 'tier-b', name: 'B', items: [] },
  { id: 'tier-c', name: '', items: getItems(6) }, // Example to start with some items
];

const Home = async () => {
  const initialTiers = getInitialTiers(); // Simulating a data fetch

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-gray-900 text-white">
      <h1 className="text-3xl mb-8">Tier Author</h1>
      <div>
        <DragDropTierList initialTiers={initialTiers} />
      </div>
    </main>
  );
};

export default Home;
