// File reads for the repository's scripts.
import fs from 'node:fs';

/**
 * The file's contents, or undefined when the file does not exist. Reading once, in place of
 * checking with existsSync and then reading, leaves no moment for the file to change between
 * the check and the read (CodeQL: js/file-system-race). Other errors are thrown as usual.
 *
 * @param {string} file
 * @param {BufferEncoding} [encoding] 'utf8' for text; leave it out for a Buffer.
 */
export function readFileIfExists(file, encoding) {
  try {
    return fs.readFileSync(file, encoding);
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
