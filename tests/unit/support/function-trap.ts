/**
 * Replaces the global Function constructor with a proxy that throws, the way a browser does
 * under a Content Security Policy without 'unsafe-eval', and counts the attempts.
 * Install it before zod is imported: zod caches the result of its eval check.
 */
export function installFunctionTrap() {
  const RealFunction = globalThis.Function;
  const attempts: string[] = [];
  const refuse = (args: unknown[]): never => {
    attempts.push(args.map(String).join(', '));
    throw new EvalError('Refused to evaluate a string as JavaScript (test CSP)');
  };
  globalThis.Function = new Proxy(RealFunction, {
    construct: (_target, args) => refuse(args),
    apply: (_target, _this, args) => refuse(args),
  });
  return {
    attempts,
    restore: () => {
      globalThis.Function = RealFunction;
    },
  };
}
