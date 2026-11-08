/**
 * zod for the app: import `z` from here, never from 'zod' directly (amendment A39).
 *
 * zod 4 speeds up object parsing with generated code (`new Function`). Before it does, every
 * `z.object()` checks once whether eval works, by running `new Function("")` in a try block.
 * Under the Content Security Policy (lib/security/csp.ts has no 'unsafe-eval'), the browser
 * blocks that call and reports a `securitypolicyviolation`, even though zod catches the error.
 * `jitless: true` turns off both the check and the generated code. Parsing gives the same
 * results, through zod's normal interpreter.
 *
 * zod keeps this setting on `globalThis`, so it applies to every zod schema in the page. It
 * must run before the first schema is built: importing `z` from this module guarantees that
 * for the importing file.
 */
import * as z from 'zod';

z.config({jitless: true});

export {z};
