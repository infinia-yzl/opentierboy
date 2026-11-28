import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {itemExtractorMachine} from '../machines/item-extractor';
import {defineModel, offered} from '../support/machines';

export type ItemExtractorSnapshot = SnapshotFrom<typeof itemExtractorMachine>;
export type ItemExtractorEvent = EventFrom<typeof itemExtractorMachine>;

const HEROES = Array.from({length: 8}, (_, index) => `heroes ${index + 1}`);

export type ItemExtractorView =
  | {readonly dialog: 'closed'; readonly list: 'Tanks'}
  | {readonly dialog: 'closed'; readonly list: 'Custom Tier List'; readonly items: readonly string[]}
  | {readonly dialog: 'empty'}
  | {readonly dialog: 'items'; readonly status: string; readonly borders: number}
  | {readonly dialog: 'names'; readonly item: number; readonly total: number; readonly named: readonly string[]};

const VIEWS: Readonly<Record<string, ItemExtractorView>> = {
  closed: {dialog: 'closed', list: 'Tanks'},
  'open.empty': {dialog: 'empty'},
  'open.eightFound': {dialog: 'items', status: '8 items found', borders: 8},
  'open.sevenLeft': {dialog: 'items', status: '8 items found', borders: 7},
  'open.noneFound': {dialog: 'items', status: 'No items found. Draw a border around one item.', borders: 0},
  'open.oneDrawn': {dialog: 'items', status: 'No items found. Draw a border around one item.', borders: 1},
  'open.naming': {dialog: 'names', item: 1, total: 8, named: []},
  'open.named': {dialog: 'names', item: 2, total: 8, named: ['Item 1: Ana']},
  'open.namedItems': {dialog: 'items', status: '8 items found', borders: 8},
  'created.eight': {dialog: 'closed', list: 'Custom Tier List', items: HEROES},
  'created.seven': {dialog: 'closed', list: 'Custom Tier List', items: HEROES.slice(0, 7)},
  'created.one': {dialog: 'closed', list: 'Custom Tier List', items: ['plain 1']},
  'created.named': {dialog: 'closed', list: 'Custom Tier List', items: ['Ana', ...HEROES.slice(1)]},
};

function pathOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${pathOf(child)}`;
}

export function itemExtractorViewOf(snapshot: ItemExtractorSnapshot): ItemExtractorView {
  const view = VIEWS[pathOf(snapshot.value)];
  if (!view) throw new RangeError(`No view for the item extractor state ${pathOf(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

export const itemExtractorModel = defineModel({
  id: 'item-extractor',
  machine: itemExtractorMachine,
  events: {
    OPEN_DIALOG: {generate: constant, when: offered('OPEN_DIALOG')},
    CANCEL: {generate: constant, when: offered('CANCEL')},
    CHOOSE_GRID: {generate: constant, when: offered('CHOOSE_GRID')},
    CHOOSE_PLAIN: {generate: constant, when: offered('CHOOSE_PLAIN')},
    DROP_PLAIN: {generate: constant, when: offered('DROP_PLAIN')},
    PASTE_GRID: {generate: constant, when: offered('PASTE_GRID')},
    REMOVE_BORDER: {generate: constant, when: offered('REMOVE_BORDER')},
    DRAW_BORDER: {generate: constant, when: offered('DRAW_BORDER')},
    OPEN_NAMES: {generate: constant, when: offered('OPEN_NAMES')},
    NAME_ITEM: {generate: constant, when: offered('NAME_ITEM')},
    OPEN_ITEMS: {generate: constant, when: offered('OPEN_ITEMS')},
    CREATE: {generate: constant, when: offered('CREATE')},
    BACK: {generate: constant, when: offered('BACK')},
  },
});
