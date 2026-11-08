/**
 * Whether a browser console message names an address on this host. The message is text
 * ("Access to image at 'https://…' from origin … has been blocked by CORS policy"), so the
 * addresses in it are parsed and their host names compared exactly.
 */
export function messageNamesHost(message: string, host: string): boolean {
  return (message.match(/https?:\/\/[^\s'"]+/g) ?? []).some((address) => {
    try {
      return new URL(address).hostname === host;
    } catch {
      return false;
    }
  });
}
