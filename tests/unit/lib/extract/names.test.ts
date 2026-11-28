import {describe, expect, it} from 'vitest';
import {automaticName, cleanName, fillNames, itemNames, nameBase, pastedNames} from '@/lib/extract/names';

describe('automaticName', () => {
  it('returns the file name without its extension and the number when the file has a name', () => {
    expect(automaticName('screenshot.png', 12)).toBe('screenshot 12');
  });

  it('returns Item and the number when the file name is only an extension', () => {
    expect(automaticName('.png', 3)).toBe('Item 3');
    expect(nameBase('  ')).toBe('Item');
  });
});

describe('cleanName', () => {
  it('returns the text with single spaces when it has tabs and runs of spaces', () => {
    expect(cleanName('  Grappling \t Hook ')).toBe('Grappling Hook');
  });
});

describe('pastedNames', () => {
  it('returns one name for each line that is not empty when the text has several lines', () => {
    expect(pastedNames('Ana\r\n\nMercy\rLucio\n')).toEqual(['Ana', 'Mercy', 'Lucio']);
  });
});

describe('fillNames', () => {
  it('returns the names from the given item on and the last filled index when lines are pasted', () => {
    expect(fillNames(['', '', '', ''], 1, ['B', 'C'])).toEqual({names: ['', 'B', 'C', ''], last: 2});
  });

  it('returns names only up to the last item when more lines are pasted than items remain', () => {
    expect(fillNames(['', ''], 1, ['B', 'C', 'D'])).toEqual({names: ['', 'B'], last: 1});
  });
});

describe('itemNames', () => {
  it('returns automatic names when items have no typed name', () => {
    expect(itemNames(['Ana', ' ', ''], 'heroes.jpg')).toEqual(['Ana', 'heroes 2', 'heroes 3']);
  });
});
