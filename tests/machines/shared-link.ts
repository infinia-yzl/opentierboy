import {createMachine} from 'xstate';

export const sharedLinkMachine = createMachine({
  id: 'sharedLink',
  description: 'A shared v3 link that holds a mix of items, opened by the browser that made it and by a new browser. The list Mixed picks holds Mauga and Winston from OVERWATCH, Red from i.imgur.com (a trusted site), Blue from images.example.org (a site OpenTierBoy does not know), My cat (a device image) and Gone hero (an item id that no image set knows). Mauga, Winston and Red always show their pictures, and Gone hero always shows the placeholder image with its name. An edit writes a new link that keeps every item as the shared link wrote it, and Back returns to the shared link.',
  type: 'parallel',
  states: {
    browser: {
      description: 'The browser that opened the shared link. Opening it again in either browser is a new page load.',
      initial: 'maker',
      on: {
        OPEN_IN_MAKER_BROWSER: {target: '.maker'},
        OPEN_IN_NEW_BROWSER: {target: '.newBrowser'},
      },
      states: {
        maker: {description: 'The browser that made the list keeps the picture of My cat in its device image store, so My cat shows that picture.'},
        newBrowser: {description: 'A new browser, such as a friend’s, does not have the picture: My cat shows the placeholder image with its name.'},
      },
    },
    list: {
      description: 'The list on screen and the link in the address bar.',
      initial: 'asShared',
      on: {
        OPEN_IN_MAKER_BROWSER: {target: '.asShared'},
        OPEN_IN_NEW_BROWSER: {target: '.asShared'},
      },
      states: {
        asShared: {
          description: 'The list as shared: Mauga and Red in S, My cat in A, Gone hero in B, Blue and Winston in Unranked. The address holds the shared link.',
          on: {DRAG_BLUE_TO_ROW_B: {target: 'edited'}},
        },
        edited: {
          description: 'Blue was dragged to the end of B. The new link holds every other item as before, and Blue as before, now in B.',
          on: {BROWSER_BACK: {target: 'asShared'}},
        },
      },
    },
    site: {
      description: 'What the page allows for images.example.org.',
      initial: 'waiting',
      on: {
        OPEN_IN_MAKER_BROWSER: {target: '.waiting'},
        OPEN_IN_NEW_BROWSER: {target: '.waiting'},
      },
      states: {
        waiting: {
          description: 'The notice “Images from other sites” lists images.example.org only. Blue is a label tile with the site’s name, and the page sent no request to the site since it loaded.',
          on: {LOAD_IMAGES: {target: 'allowedHere'}},
        },
        allowedHere: {description: 'Load allowed the site for this page: no notice, and Blue shows its picture. The edit and Back stay on the page, so they keep it allowed.'},
      },
    },
  },
});
