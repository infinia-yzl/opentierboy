/**
 * The live view of the model tests (tests/README.md, "Model-based tests"): a local run with
 * MODEL_INSPECT=1 streams each walk's machine steps to Stately's hosted inspector, so the
 * machine can be watched while Playwright drives the page. CI never turns it on.
 */
export const modelInspectOn = process.env.MODEL_INSPECT === '1' && !process.env.CI;

/** The host of Stately's hosted inspector relay (@statelyai/sdk's default, wss://sky.stately.ai). */
export const INSPECTOR_HOSTNAMES: readonly string[] = Object.freeze(['sky.stately.ai']);
