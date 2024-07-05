export default interface Item {
  id: string;
  content: string;
  imageUrl?: string;
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}
