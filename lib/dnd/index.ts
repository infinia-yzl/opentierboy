/**
 * Drag and drop adapter for the tier list. lib/dnd is the only module that may import
 * dnd-kit (the fork in packages/dnd-kit, see docs/reference/drag-and-drop.md); ESLint enforces it.
 *
 * - model.ts          shared types (positions, moves, directions)
 * - moves.ts          list changes: move items, reorder rows (labels stay), add/remove rows
 * - preview.ts        the list as a drag shows it, and the move it makes on drop
 * - keyboard.ts       arrow key targets in rows that wrap onto several lines
 * - labels.ts         row and item names for people
 * - announcements.ts  screen reader texts, with tier labels
 * - activation.ts     when a press becomes a drag (mouse, touch hold, long-press menu)
 * - ids.ts            the ids dnd-kit sees
 * - dndKit.ts         dnd-kit sensors, plugins and page measurements built from the pieces above
 * - react.tsx         the React components and hooks (TierDragDrop, useTierRow, useTierItems,
 *                     useTierItem); import them from '@/lib/dnd/react' (client components)
 *
 * Everything except dndKit.ts and react.tsx is pure (no React, no DOM, no dnd-kit) and can be
 * imported from its own file.
 */

export * from './model';
export * from './ids';
export * from './labels';
export * from './moves';
export * from './preview';
export * from './keyboard';
export * from './announcements';
export * from './activation';
export * from './dndKit';
