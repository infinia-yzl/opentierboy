import type {AddTemplateIndexFailure} from './indexList';
import type {LoadIndexFailure} from './loadIndex';
import type {TemplateFileFailure} from './templateFile';

export const TEMPLATE_INDEX_NOTICE = 'Templates in this index come from other people. OpenTierBoy does not review them.';

const ADDRESS = 'This is not the address of an index. An index is a .json file on raw.githubusercontent.com or gist.githubusercontent.com.';
const UNREACHABLE = 'The index could not be reached. Check your connection, or the index may have moved.';
const LIMITED = 'GitHub is limiting requests at the moment. Try again later.';
const BROKEN = 'This index is damaged or was not made for OpenTierBoy.';

export const LOAD_INDEX_MESSAGES: Readonly<Record<LoadIndexFailure, string>> = Object.freeze({
  'address-invalid': ADDRESS,
  'address-host': ADDRESS,
  'address-shape': ADDRESS,
  blocked: 'OpenTierBoy has blocked this index.',
  network: UNREACHABLE,
  'not-found': 'The index was not found at this address.',
  limited: LIMITED,
  status: 'The host of the index answered with an error. Try again later.',
  'too-large': 'This index is too large.',
  timeout: 'The index took too long to answer. Try again later.',
  cancelled: 'Cancelled.',
  'bad-text': BROKEN,
  'too-many-values': BROKEN,
  'bad-json': BROKEN,
  invalid: BROKEN,
  'unsupported-format': 'This index was made for a newer OpenTierBoy.',
});

export const ADD_INDEX_MESSAGES: Readonly<Record<AddTemplateIndexFailure, string>> = Object.freeze({
  address: ADDRESS,
  blocked: 'OpenTierBoy has blocked this index.',
  listed: 'This index is already in your list.',
  full: 'Your list of indices is full. Remove one first.',
  storage: 'Your browser could not save the index.',
});

export const TEMPLATE_FILE_MESSAGES: Readonly<Record<TemplateFileFailure, string>> = Object.freeze({
  blocked: 'OpenTierBoy has blocked this template.',
  address: 'The address of this template is not allowed.',
  size: 'This template changed since it was listed. Its size differs from the index.',
  checksum: 'This template changed since it was listed. Its checksum differs from the index.',
  unchecked: 'Your browser cannot check this template on this page.',
  network: 'The template could not be reached. Check your connection, or the template may have moved.',
  'not-found': 'The template was not found at its address.',
  limited: LIMITED,
  status: 'The host of the template answered with an error. Try again later.',
  timeout: 'The template took too long to arrive. Try again later.',
  cancelled: 'Cancelled.',
});

export const TEMPLATE_WITHOUT_LIST = 'This file does not contain a list, so it cannot open as a template.';
