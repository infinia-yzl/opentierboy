export const modelInspectOn = process.env.MODEL_INSPECT === '1' && !process.env.CI;

export const INSPECTOR_HOSTNAMES: readonly string[] = Object.freeze(['sky.stately.ai']);
