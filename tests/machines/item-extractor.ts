import {createMachine} from 'xstate';

export const itemExtractorMachine = createMachine({
  id: 'itemExtractor',
  description: 'The dialog “Extract items from a picture” (Add images › Extract items from a picture…) on the list Tanks, with Mauga in row S. A drawn grid of 8 tiles shows 8 borders; a plain picture shows none, and the user draws one. A picture is chosen with “Choose a picture”, and a later one replaces it when it is dropped on the dialog or pasted. Borders can be removed. Step “2 Names” names items one by one. “Create a list with n items” opens a new list, Custom Tier List, with every item in Unranked, as one Back step. Escape closes the dialog and adds nothing.',
  initial: 'closed',
  states: {
    closed: {
      description: 'The list Tanks, with Mauga in row S. The dialog is closed.',
      on: {OPEN_DIALOG: {target: 'open'}},
    },
    open: {
      description: 'The dialog is open. Escape closes it and adds nothing.',
      initial: 'empty',
      on: {CANCEL: {target: 'closed'}},
      states: {
        empty: {
          description: 'No picture yet: “Choose a picture” shows, and “Create a list with 0 items” is off.',
          on: {
            CHOOSE_GRID: {target: 'eightFound'},
            CHOOSE_PLAIN: {target: 'noneFound'},
          },
        },
        eightFound: {
          description: 'Step “1 Items” with the grid: “8 items found”, 8 borders and 8 tiles.',
          on: {
            REMOVE_BORDER: {target: 'sevenLeft'},
            OPEN_NAMES: {target: 'naming'},
            DROP_PLAIN: {target: 'noneFound'},
            CREATE: {target: '#itemExtractor.created.eight'},
          },
        },
        sevenLeft: {
          description: 'Step “1 Items” after the first border was removed: 7 borders and 7 tiles.',
          on: {CREATE: {target: '#itemExtractor.created.seven'}},
        },
        noneFound: {
          description: 'Step “1 Items” with the plain picture: “No items found”, no border, and the button is off.',
          on: {
            DRAW_BORDER: {target: 'oneDrawn'},
            PASTE_GRID: {target: 'eightFound'},
          },
        },
        oneDrawn: {
          description: 'Step “1 Items” with one border drawn by the user: “Item 1 of 1” has the focus.',
          on: {CREATE: {target: '#itemExtractor.created.one'}},
        },
        naming: {
          description: 'Step “2 Names” on item 1 of 8: the name field has the focus and is empty.',
          on: {NAME_ITEM: {target: 'named'}},
        },
        named: {
          description: 'Step “2 Names” on item 2 of 8, after item 1 was named Ana.',
          on: {
            CREATE: {target: '#itemExtractor.created.named'},
            OPEN_ITEMS: {target: 'namedItems'},
          },
        },
        namedItems: {
          description: 'Back in step “1 Items” after item 1 was named Ana: 8 borders, and the name stays.',
          on: {CREATE: {target: '#itemExtractor.created.named'}},
        },
      },
    },
    created: {
      description: 'The dialog closed, and the new list Custom Tier List shows its items in Unranked. Back returns to Tanks.',
      initial: 'eight',
      on: {BACK: {target: 'closed'}},
      states: {
        eight: {description: 'Unranked holds heroes 1 to heroes 8.'},
        seven: {description: 'Unranked holds heroes 1 to heroes 7: the automatic names follow the numbers of the 7 borders left.'},
        one: {description: 'Unranked holds plain 1.'},
        named: {description: 'Unranked holds Ana and heroes 2 to heroes 8.'},
      },
    },
  },
});
