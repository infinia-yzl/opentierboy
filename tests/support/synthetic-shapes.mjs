#!/usr/bin/env node
/**
 * Writes a made-up shapes config for the tile shape tests (tests/e2e/tile-shapes.spec.ts):
 * some OVERWATCH images become landscape or portrait in imageset.config.json. No image set
 * publishes such shapes yet (A13), so the tests need this. Only for a throwaway build, never
 * for a commit: the unit test in tests/unit/shapes.test.ts fails while the config holds it.
 *
 *   npm run build                                  # prepares the images and the config
 *   node tests/support/synthetic-shapes.mjs        # then marks the shapes
 *   npx next build                                 # builds again, without the prebuild step that rewrites the config
 *   npx playwright test tests/e2e/tile-shapes.spec.ts
 *   git checkout imageset.config.json              # back to the real config
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Item labels of image-overwatch and the shape each gets. */
export const SYNTHETIC_SHAPES = Object.freeze({
  Mauga: 'landscape',
  Sigma: 'landscape',
  Ramattra: 'landscape',
  Winston: 'portrait',
  'D.Va': 'portrait',
  Orisa: 'portrait',
});

const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../imageset.config.json');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const set = config.packages['image-overwatch'];
  for (const [label, shape] of Object.entries(SYNTHETIC_SHAPES)) {
    const image = set.images.find((entry) => entry.label === label);
    if (!image) throw new Error(`No OVERWATCH image labelled ${label}`);
    image.shape = shape;
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Marked ${Object.keys(SYNTHETIC_SHAPES).length} OVERWATCH images in ${configPath}`);
}
