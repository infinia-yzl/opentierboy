import {expect, test} from '../support/test';
import {v3State} from '../support/links';
import {BLUE_SQUARE, RED_SQUARE} from '../support/image-sites';
import {pngWithSnapshotText} from '../support/snapshot-files';
import {
  INDEX_ADDRESS,
  serveTemplateSite,
  TEMPLATE_HOST,
  TEMPLATE_SOURCE,
  templateEntry,
  templateFileAddress,
  templateIndex,
} from '../support/template-sites';

const NOTICE = 'Templates in this index come from other people. OpenTierBoy does not review them.';

function templateFile(title: string, images: {id: string; label: string; png: Buffer}[]): Buffer {
  const state = v3State({t: title, tp: 3, r: [['S', images.map(({id, label}) => ({d: id, c: label}))], ['A', []], ['B', []], ['', []]]});
  const payload = {
    version: 1,
    state,
    path: '/rank',
    images: images.map(({id, label, png}) => ({id, label, dataUrl: `data:image/png;base64,${png.toString('base64')}`})),
  };
  return pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload));
}

const HEROES = templateFile('Example heroes', [
  {id: 'template-img-red1', label: 'Red hero', png: RED_SQUARE},
  {id: 'template-img-blue', label: 'Blue hero', png: BLUE_SQUARE},
]);
const WEAPONS = templateFile('Example weapons', [{id: 'template-img-red2', label: 'Red weapon', png: RED_SQUARE}]);

const TWO_TEMPLATES = templateIndex([
  templateEntry('heroes', 'Example heroes', HEROES, {game: 'Example game', author: 'example-maker', images: 2}),
  templateEntry('weapons', 'Example weapons', WEAPONS, {game: 'Other game'}),
], {maintainer: 'example-maintainer', contact: 'Open an issue at github.com/example/otb-templates'});

test.describe('community templates', () => {
  test.describe('indices', () => {
    test('renders the empty state and writes no request when the user opens Community templates without an index', async ({tierList, page}) => {
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');

      await tierList.templates.open();

      await expect(tierList.templates.dialog).toContainText('You have not added an index yet.');
      await expect(tierList.templates.addressField).toBeVisible();
      await expect.poll(() => tierList.templates.focusIsInDialog()).toBe(true);
      await expect(tierList.templates.checkButton).toBeDisabled();
      await expect(tierList.templates.listedTemplates).toHaveCount(0);
      expect(site.requests).toEqual([]);
    });

    test('renders the name, the source, the count and the notice when the user checks an index address', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();

      await tierList.templates.checkIndex(INDEX_ADDRESS);

      const preview = tierList.templates.indexToAdd;
      await expect(preview).toContainText('Example templates');
      await expect(preview).toContainText(`listed by ${TEMPLATE_SOURCE}`);
      await expect(preview).toContainText('2 templates, maintained by example-maintainer');
      await expect(preview).toContainText(NOTICE);
      await expect(tierList.templates.listedTemplates).toHaveCount(0);
      expect(await tierList.templates.storedIndices()).toBeNull();
    });

    test('renders both templates with their details, also after a reload, when the user adds the index', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();

      await tierList.templates.addIndex(INDEX_ADDRESS);

      const listed = tierList.templates.listedBy(TEMPLATE_SOURCE);
      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes', 'Example weapons']);
      await expect(listed).toContainText('Example game · 2 images · by example-maker');
      await expect(listed).toContainText('Report a template: Open an issue at github.com/example/otb-templates');
      await expect(tierList.templates.addressField).toHaveValue('');
      await expect(tierList.templates.addressField).toBeFocused();
      expect(await tierList.templates.storedIndices()).toBe(JSON.stringify([INDEX_ADDRESS]));

      await page.reload();
      await tierList.templates.open();
      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes', 'Example weapons']);
    });

    test('renders only the matching template when the user searches by title, game or author', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);

      await tierList.templates.search('weap');
      await expect(tierList.templates.listedTemplates).toHaveText(['Example weapons']);
      await tierList.templates.search('EXAMPLE GAME');
      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes']);
      await tierList.templates.search('example-maker');
      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes']);
      await tierList.templates.search('zzz');
      await expect(tierList.templates.listedTemplates).toHaveCount(0);
      await expect(tierList.templates.dialog).toContainText('No template of this index matches your search.');
    });

    test('renders no template and writes an empty store when the user removes the index', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);
      await expect(tierList.templates.listedTemplates).toHaveCount(2);

      await tierList.templates.removeIndex(TEMPLATE_SOURCE);

      await expect(tierList.templates.listedTemplates).toHaveCount(0);
      await expect(tierList.templates.dialog).toContainText('You have not added an index yet.');
      await expect(tierList.templates.addressField).toBeFocused();
      expect(await tierList.templates.storedIndices()).toBeNull();
    });

    test('renders no index to add when the user edits the address while the first check is still running', async ({tierList, page}) => {
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      const held = site.hold(INDEX_ADDRESS);
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addressField.fill(INDEX_ADDRESS);
      await tierList.templates.checkButton.click();
      await expect.poll(held.isHolding).toBe(true);

      await tierList.templates.addressField.fill(`${INDEX_ADDRESS.replace('index.json', 'other.json')}`);
      held.release();

      await expect(tierList.templates.checkButton).toBeEnabled();
      await expect(tierList.templates.indexToAdd).toBeHidden();
      await tierList.templates.checkButton.click();
      await expect(tierList.templates.alerts).toHaveText(['The index was not found at this address.']);
      await expect(tierList.templates.indexToAdd).toBeHidden();
    });

    test('renders the new template when the index changed and the user clicks Refresh', async ({tierList, page}) => {
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: templateIndex([templateEntry('heroes', 'Example heroes', HEROES)])});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);
      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes']);
      site.serve(INDEX_ADDRESS, TWO_TEMPLATES);

      await tierList.templates.refresh();

      await expect(tierList.templates.listedTemplates).toHaveText(['Example heroes', 'Example weapons']);
    });

    test('renders a refusal and writes no request when the address is on another host or has another shape', async ({tierList, page}) => {
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();

      for (const address of ['https://example.org/example/otb-templates/main/index.json', `${INDEX_ADDRESS}?token=1`, INDEX_ADDRESS.replace('https:', 'http:'), INDEX_ADDRESS.replace('.json', '.html')]) {
        await tierList.templates.checkIndex(address);
        await expect(tierList.templates.alerts, address).toHaveText(['This is not the address of an index. An index is a .json file on raw.githubusercontent.com or gist.githubusercontent.com.']);
      }
      await expect(tierList.templates.indexToAdd).toBeHidden();
      expect(site.requests).toEqual([]);
    });

    test('renders a plain message when the host answers 404 or serves a page in place of an index', async ({tierList, page}) => {
      const site = await serveTemplateSite(page);
      await tierList.goto('/rank');
      await tierList.templates.open();

      await tierList.templates.checkIndex(INDEX_ADDRESS);
      await expect(tierList.templates.alerts).toHaveText(['The index was not found at this address.']);

      site.serve(INDEX_ADDRESS, '<!doctype html><title>Sign in</title>');
      await tierList.templates.checkIndex(INDEX_ADDRESS);
      await expect(tierList.templates.alerts).toHaveText(['This index is damaged or was not made for OpenTierBoy.']);
      await expect(tierList.templates.indexToAdd).toBeHidden();
    });

    test('renders markup in an index as text and the count of skipped entries when the index has hostile entries', async ({tierList, page}) => {
      const markup = '<img src=x onerror="window.__otbInjected=1">';
      await serveTemplateSite(page, {
        [INDEX_ADDRESS]: templateIndex([
          templateEntry('heroes', `Heroes ${markup}`, HEROES, {game: markup, author: markup}),
          templateEntry('elsewhere', 'On another host', HEROES, {file: 'https://example.org/example/otb-templates/main/a.png'}),
          templateEntry('script', 'A script address', HEROES, {file: 'javascript:window.__otbInjected=2'}),
        ], {name: `Index ${markup}`, contact: markup}),
      });
      await tierList.goto('/rank');
      await tierList.templates.open();

      await tierList.templates.addIndex(INDEX_ADDRESS);

      await expect(tierList.templates.listedTemplates).toHaveText([`Heroes ${markup}`]);
      const listed = tierList.templates.listedBy(TEMPLATE_SOURCE);
      await expect(listed).toContainText(`Index ${markup}`);
      await expect(listed).toContainText(`Report a template: ${markup}`);
      await expect(listed).toContainText('2 entries were skipped: they do not follow the index rules.');
      expect(await tierList.templates.injectedMarkupRan()).toBe(false);
    });
  });

  test.describe('opening a template', () => {
    test('writes 1 history entry and renders the list with its pictures when the user picks a template and opens the list', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES, [templateFileAddress('heroes')]: HEROES});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.templates.template('Example heroes').click();

      await expect(tierList.files.openListDialog).toBeVisible();
      await expect(tierList.templates.dialog).toBeHidden();
      await tierList.files.confirmOpenList();
      await expect(tierList.itemsIn('S')).toHaveText(['Red hero', 'Blue hero']);
      await expect.poll(() => tierList.itemImageHasLoaded('Blue hero')).toBe(true);
      await expect.poll(newEntries).toBe(1);
    });

    test('writes GET requests without cookies or a referrer when the browser has a cookie for the template host', async ({tierList, page}) => {
      await page.context().addCookies([{name: 'session', value: 'secret', domain: TEMPLATE_HOST, path: '/', secure: true, sameSite: 'None'}]);
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES, [templateFileAddress('heroes')]: HEROES});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);
      await tierList.templates.template('Example heroes').click();
      await expect(tierList.files.openListDialog).toBeVisible();

      expect(site.requests.map((request) => request.url)).toContain(templateFileAddress('heroes'));
      for (const request of site.requests) {
        expect(new URL(request.url).host, request.url).toBe(TEMPLATE_HOST);
        expect(request.method, request.url).toBe('GET');
        expect(Object.keys(request.headers).filter((name) => ['cookie', 'referer', 'authorization'].includes(name)), request.url).toEqual([]);
      }
    });

    test('renders the templates again without a message when the user cancels while a template is on its way', async ({tierList, page}) => {
      const site = await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES, [templateFileAddress('heroes')]: HEROES});
      const held = site.hold(templateFileAddress('heroes'));
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);
      await tierList.templates.template('Example heroes').click();
      await expect(tierList.templates.gettingStatus).toContainText('Getting “Example heroes”…');
      await expect(tierList.templates.template('Example weapons')).toBeDisabled();
      await expect.poll(held.isHolding).toBe(true);

      await tierList.templates.cancelGetting();
      held.release();

      await expect(tierList.templates.gettingStatus).toBeHidden();
      await expect(tierList.templates.template('Example weapons')).toBeEnabled();
      await expect(tierList.templates.alerts).toHaveCount(0);
      await expect(tierList.files.openListDialog).toBeHidden();
    });

    test('renders "This template changed since it was listed" and opens no list when one byte of the file differs', async ({tierList, page}) => {
      const changed = Buffer.from(HEROES);
      changed[changed.length - 20] ^= 1;
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES, [templateFileAddress('heroes')]: changed});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);

      await tierList.templates.template('Example heroes').click();

      await expect(tierList.templates.alerts).toHaveText(['This template changed since it was listed. Its checksum differs from the index.']);
      await expect(tierList.files.openListDialog).toBeHidden();
      await expect(tierList.templates.dialog).toBeVisible();
    });

    test('renders the size message and opens no list when the file is longer than the index states', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES, [templateFileAddress('heroes')]: Buffer.concat([HEROES, Buffer.alloc(1)])});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);

      await tierList.templates.template('Example heroes').click();

      await expect(tierList.templates.alerts).toHaveText(['This template changed since it was listed. Its size differs from the index.']);
      await expect(tierList.files.openListDialog).toBeHidden();
    });

    test('renders a message and adds no item when the listed file is a picture without a list', async ({tierList, page}) => {
      await serveTemplateSite(page, {
        [INDEX_ADDRESS]: templateIndex([templateEntry('plain', 'Plain picture', RED_SQUARE)]),
        [templateFileAddress('plain')]: RED_SQUARE,
      });
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);

      await tierList.templates.template('Plain picture').click();

      await expect(tierList.templates.alerts).toHaveText(['This file does not contain a list, so it cannot open as a template.']);
      await expect(tierList.files.openListDialog).toBeHidden();
      await tierList.templates.close();
      await expect(tierList.allItems).toHaveCount(0);
    });

    test('renders "The template was not found at its address." when the host answers 404 for the file', async ({tierList, page}) => {
      await serveTemplateSite(page, {[INDEX_ADDRESS]: TWO_TEMPLATES});
      await tierList.goto('/rank');
      await tierList.templates.open();
      await tierList.templates.addIndex(INDEX_ADDRESS);

      await tierList.templates.template('Example weapons').click();

      await expect(tierList.templates.alerts).toHaveText(['The template was not found at its address.']);
    });
  });
});
