import {createMachine} from 'xstate';

export const editorRowsMachine = createMachine({
  id: 'editorRows',
  description: 'Adding and removing rows, and switching the row template, from a list that opens with 19 ranked rows: S holds Mauga, the last ranked row R19 holds Winston, and Unranked holds Sigma. A list has at most 20 rows, Unranked included, and keeps at least 1 ranked row. Add row puts a row labelled Tier n above Unranked. Row options › Remove a row › the first row removes the top row, and its items go to the end of Unranked. Choosing 3, 5 or 7 Rows gives the template rows and labels: items stay in a row of the same id, and the items of rows that disappear go to Unranked, before its own items. A cleared label reads Tier n, after its place. Every change that changes the list adds one history entry; a choice that changes nothing adds none.',
  initial: 'nineteen',
  states: {
    nineteen: {
      description: 'The list as opened: S (Mauga), A, B, C, F and R6 to R19 (Winston), and Unranked (Sigma). 20 rows, so Add row is off. Remove a row is on.',
      on: {
        REMOVE_FIRST_ROW: {target: 'eighteen'},
        CHOOSE_3_ROWS: {target: 'three'},
        CHOOSE_5_ROWS: {target: 'five'},
        CHOOSE_7_ROWS: {target: 'seven'},
      },
    },
    eighteen: {
      description: 'Row S is gone: A, B, C, F and R6 to R19 (Winston). Mauga went to the end of Unranked (Sigma, Mauga). Add row is on again.',
      on: {ADD_ROW: {target: 'nineteenAdded'}},
    },
    nineteenAdded: {
      description: 'A new empty row, Tier 19, above Unranked: 20 rows again, so Add row is off.',
    },
    three: {
      description: 'The 3-row template: S (Mauga), A and B. Winston, whose row R19 is gone, went to Unranked before Sigma (Winston, Sigma). Choosing 3 Rows again changes nothing.',
      on: {
        CHOOSE_5_ROWS: {target: 'five'},
        CHOOSE_7_ROWS: {target: 'seven'},
        CLEAR_SECOND_LABEL: {target: 'threeCleared'},
      },
    },
    threeCleared: {
      description: 'The label of the second row, A, was cleared: the row reads Tier 2. S (Mauga), Tier 2 and B. Choosing 3 Rows puts the template labels back.',
      on: {
        REMOVE_FIRST_ROW: {target: 'twoCleared'},
        CHOOSE_3_ROWS: {target: 'three'},
      },
    },
    twoCleared: {
      description: 'Row S is gone, so the cleared row is now first and reads Tier 1: Tier 1 and B. Mauga went to the end of Unranked (Winston, Sigma, Mauga).',
      on: {REMOVE_FIRST_ROW: {target: 'one'}},
    },
    one: {
      description: 'Only row B is left, the fewest ranked rows a list keeps: Remove a row is off. Unranked holds Winston, Sigma and Mauga.',
      on: {ADD_ROW: {target: 'twoAdded'}},
    },
    twoAdded: {
      description: 'A new empty row, Tier 2, below B: Remove a row is on again.',
    },
    five: {
      description: 'The 5-row template: S (Mauga), A, B, C and F, and Unranked (Winston, Sigma). Choosing 5 Rows again changes nothing.',
      on: {
        CHOOSE_3_ROWS: {target: 'three'},
        CHOOSE_7_ROWS: {target: 'seven'},
      },
    },
    seven: {
      description: 'The 7-row template: SS, S (Mauga), A, B, C, D and F, and Unranked (Winston, Sigma). Choosing 7 Rows again changes nothing.',
      on: {
        CHOOSE_3_ROWS: {target: 'three'},
        CHOOSE_5_ROWS: {target: 'five'},
      },
    },
  },
});
