import {createMachine} from 'xstate';

export const mouseDragMachine = createMachine({
  id: 'mouseDrag',
  description: 'Ranking with the mouse in a list of rows S and A and the Unranked tray, with two tiles: Mauga, which the user drags, and Winston, which starts in row S and moves only with its row. Each drag is one press, move and release. A tile dropped on the free space of another row goes to its end; dropped on the left or right half of Winston, it goes just before or just after him. A row dragged by its handle onto the other row takes its place: the contents swap and the labels stay S, A from top to bottom. Each drop that changes the list writes a new link and one new history entry. A drop where the tile started, or a release outside the rows, changes nothing.',
  initial: 'winstonInS',
  states: {
    winstonInS: {
      description: 'Winston is in row S.',
      initial: 'maugaInUnranked',
      states: {
        maugaInUnranked: {
          description: 'S: Winston. A: empty. Unranked: Mauga.',
          on: {
            DRAG_MAUGA_TO_S: {target: 'maugaLast'},
            DRAG_MAUGA_TO_A: {target: 'maugaInA'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInA.maugaInUnranked'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInA.maugaInUnranked'},
          },
        },
        maugaInA: {
          description: 'S: Winston. A: Mauga. Unranked: empty.',
          on: {
            DRAG_MAUGA_TO_S: {target: 'maugaLast'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInA.maugaInS'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInA.maugaInS'},
          },
        },
        maugaFirst: {
          description: 'S: Mauga, Winston. A: empty. Unranked: empty. A drag along row S to its free space passes over Winston, so Mauga lands after him or stays first by the way the pointer went: the model leaves that drag out.',
          on: {
            DRAG_MAUGA_TO_A: {target: 'maugaInA'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInA.maugaFirst'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInA.maugaFirst'},
          },
        },
        maugaLast: {
          description: 'S: Winston, Mauga. A: empty. Unranked: empty.',
          on: {
            DRAG_MAUGA_TO_A: {target: 'maugaInA'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInA.maugaLast'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInA.maugaLast'},
          },
        },
      },
    },
    winstonInA: {
      description: 'Winston is in row A: a row drag moved him there.',
      initial: 'maugaInUnranked',
      states: {
        maugaInUnranked: {
          description: 'S: empty. A: Winston. Unranked: Mauga.',
          on: {
            DRAG_MAUGA_TO_S: {target: 'maugaInS'},
            DRAG_MAUGA_TO_A: {target: 'maugaLast'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInS.maugaInUnranked'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInS.maugaInUnranked'},
          },
        },
        maugaInS: {
          description: 'S: Mauga. A: Winston. Unranked: empty.',
          on: {
            DRAG_MAUGA_TO_A: {target: 'maugaLast'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInS.maugaInA'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInS.maugaInA'},
          },
        },
        maugaFirst: {
          description: 'S: empty. A: Mauga, Winston. Unranked: empty. A drag along row A to its free space passes over Winston, so Mauga lands after him or stays first by the way the pointer went: the model leaves that drag out.',
          on: {
            DRAG_MAUGA_TO_S: {target: 'maugaInS'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInS.maugaFirst'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInS.maugaFirst'},
          },
        },
        maugaLast: {
          description: 'S: empty. A: Winston, Mauga. Unranked: empty.',
          on: {
            DRAG_MAUGA_TO_S: {target: 'maugaInS'},
            DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
            DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
            DRAG_ROW_S_ONTO_A: {target: '#mouseDrag.winstonInS.maugaLast'},
            DRAG_ROW_A_ONTO_S: {target: '#mouseDrag.winstonInS.maugaLast'},
          },
        },
      },
    },
  },
});
