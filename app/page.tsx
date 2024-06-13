import DragDrop from '../components/DragDrop';

interface Item {
  id: string;
  content: string;
}

const getItems = (count: number): Item[] =>
  Array.from({ length: count }, (v, k) => k).map((k) => ({
    id: `item-${k}`,
    content: `item ${k}`,
  }));

const Home = async () => {
  const initialItems = getItems(6); // Simulating a data fetch

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1 className="text-3xl">Tier Author</h1>
      <div>
        <DragDrop initialItems={initialItems} />
      </div>
      <div>What will you be authoring today?</div>
    </main>
  );
};

export default Home;
