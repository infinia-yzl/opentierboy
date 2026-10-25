/**
 * Drag and drop adapter for the tier list. lib/dnd is the only module that may import
 * dnd-kit (the fork in packages/dnd-kit, see docs/dnd-fork.md); ESLint enforces it.
 *
 * - model.ts          shared types (positions, moves, directions)
 * - moves.ts          list changes: move items, reorder rows (labels stay), add/remove rows
 * - sortable.ts       read a finished dnd-kit drag as a move
 * - keyboard.ts       arrow key targets in rows that wrap onto several lines
 * - labels.ts         row and item names for people
 * - announcements.ts  screen reader texts, with tier labels
 * - activation.ts     when a press becomes a drag (mouse, touch hold, long-press menu)
 * - ids.ts            the ids dnd-kit sees
 * - dndKit.ts         dnd-kit sensors and plugins built from the pieces above
 *
 * Everything except dndKit.ts is pure (no React, no DOM, no dnd-kit) and can be imported
 * from its own file.
 */

export * from './model';
export * from './ids';
export * from './labels';
export * from './moves';
export * from './sortable';
export * from './keyboard';
export * from './announcements';
export * from './activation';
export * from './dndKit';
