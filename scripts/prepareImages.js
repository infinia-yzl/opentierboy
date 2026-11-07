/**
 * Prepares the image sets before `next dev` and `next build` (npm scripts `dev` and `prebuild`)
 * and writes imageset.config.json.
 *
 * Every image set comes from an npm package. For each one, it copies (or, in development,
 * symlinks) the package's images into public/images/<package>/ and makes a PNG copy of every
 * WebP image for link previews. Nothing in public/images/ is committed.
 *
 * Active sets (imageset.custom.json entries without "legacy") get their config entry from
 * their package and their display data from imageset.custom.json.
 *
 * Legacy sets ({"legacy": true} in imageset.custom.json) are frozen. Their packages are pinned
 * to an exact version in package.json, and their config entries are the frozen entries of
 * imageset.legacy.json. The script builds each legacy entry from its package too, with the
 * frozen display data, and stops when it differs from the frozen entry in any way
 * (frozenEntryDifferences in scripts/lib/image-sets.mjs).
 *
 * The PNG copies are made at link preview size (PREVIEW_COPY_SIZE in scripts/lib/image-sets.mjs:
 * the shorter side 128 px, never enlarged), and so is a copy of the placeholder tile
 * (public/placeholder-image.preview.png), so that drawing a preview stays fast (A43).
 *
 * imageset.config.json lists the sets in the order of imageset.custom.json.
 *
 * It stops with exit code 1, and leaves imageset.config.json as it was, when a package is
 * missing, has no images, an image or its PNG copy is not in public/images/, or a legacy set's
 * package builds a config entry other than its frozen one. It never deletes a folder that
 * holds committed files.
 */
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const {execFileSync} = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'imageset.config.json');
const CUSTOM_CONFIG_PATH = path.join(ROOT, 'imageset.custom.json');
const LEGACY_CONFIG_PATH = path.join(ROOT, 'imageset.legacy.json');

/** Pure helpers shared with the tests and the image-set-update workflow (an ES module). */
const imageSets = import('./lib/image-sets.mjs');

async function callPackageFunction(packageName, functionName, ...args) {
  const packageModule = await import(packageName);
  if (typeof packageModule[functionName] !== 'function') {
    throw new Error(`Function ${functionName} not found in package ${packageName}`);
  }
  return packageModule[functionName](...args);
}

async function getCustomConfig() {
  try {
    const customConfigFile = await fs.readFile(CUSTOM_CONFIG_PATH, 'utf8');
    return JSON.parse(customConfigFile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Custom config file not found. Creating a new one.');
      return await createCustomConfig();
    } else {
      console.error('Error reading custom config file:', error);
      throw error;
    }
  }
}

async function createCustomConfig() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const packages = await new Promise((resolve) => {
    rl.question('Please enter the package names, separated by commas: ', (answer) => {
      resolve(answer.split(',').map(pkg => pkg.trim()).filter(pkg => pkg));
      rl.close();
    });
  });

  const customConfig = {
    packages: packages.reduce((acc, pkg) => {
      acc[pkg] = {displayName: pkg};
      return acc;
    }, {})
  };

  await fs.writeFile(CUSTOM_CONFIG_PATH, JSON.stringify(customConfig, null, 2));
  console.log(`Custom configuration created with packages: ${packages.join(', ')}`);
  return customConfig;
}

async function getLegacyConfig() {
  try {
    return JSON.parse(await fs.readFile(LEGACY_CONFIG_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Cannot read imageset.legacy.json: ${error.message}`);
  }
}

async function logImageSetContents(dir, level = 0) {
  const items = await fs.readdir(dir, {withFileTypes: true});
  for (const item of items) {
    const indent = '  '.repeat(level);
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      console.log(`${indent}📁 ${item.name}`);
      await logImageSetContents(fullPath, level + 1);
    } else {
      console.log(`${indent}📄 ${item.name}`);
    }
  }
}

async function findImageDirectory(packageName) {
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', packageName, 'public', 'images'),
    path.join(__dirname, '..', 'node_modules', packageName, 'images'),
  ];

  for (const dir of possiblePaths) {
    try {
      await fs.access(dir);
      return dir;
    } catch (error) {
      // Directory doesn't exist, try the next one
    }
  }

  throw new Error(`Could not find image directory for package: ${packageName}`);
}

/** Makes the PNG copy of an image for link previews, at preview size (see PREVIEW_COPY_SIZE). */
async function convertWebpToPng(sourcePath, targetPath) {
  try {
    const {PREVIEW_COPY_SIZE} = await imageSets;
    await sharp(sourcePath)
      .resize({width: PREVIEW_COPY_SIZE, height: PREVIEW_COPY_SIZE, fit: 'outside', withoutEnlargement: true})
      .png()
      .toFile(targetPath);
    console.log(`Converted: ${sourcePath} -> ${targetPath}`);
  } catch (error) {
    console.error(`Error converting ${sourcePath} to PNG:`, error);
  }
}

async function processWebpImages(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, {recursive: true});
      await processWebpImages(sourcePath, targetPath);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.webp') {
      const pngTargetPath = targetPath.replace(/\.webp$/i, '.png');
      await convertWebpToPng(sourcePath, pngTargetPath);
    }
  }
}

// DO NOT MODIFY THIS FUNCTION
// It doesn't use COPY intentionally due to Vercel deployment weird behavior
async function copyFile(src, dest) {
  try {
    // Ensure the destination directory exists
    await fs.mkdir(path.dirname(dest), {recursive: true});

    // Read the source file
    const content = await fs.readFile(src);

    // Create the destination file (this will overwrite if it already exists)
    await fs.writeFile(dest, '');

    // Write the content to the destination file
    await fs.writeFile(dest, content);

    console.log(`Successfully copied: ${src} -> ${dest}`);
  } catch (error) {
    console.error(`Error copying file ${src}:`, error);
    try {
      const sourceStats = await fs.stat(src);
      console.log(`Source file stats:`, sourceStats);
      const destDirStats = await fs.stat(path.dirname(dest));
      console.log(`Destination directory stats:`, destDirStats);
    } catch (statError) {
      console.error(`Error getting file stats:`, statError);
    }
  }
}

async function copyImagesRecursively(sourceDir, targetDir) {
  console.log(`Copying images from ${sourceDir} to ${targetDir}`);
  try {
    const entries = await fs.readdir(sourceDir, {withFileTypes: true});

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        console.log(`Creating directory: ${targetPath}`);
        await fs.mkdir(targetPath, {recursive: true});
        await copyImagesRecursively(sourcePath, targetPath);
      } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name)) {
        console.log(`Copying: ${sourcePath} -> ${targetPath}`);
        await copyFile(sourcePath, targetPath);

        if (path.extname(entry.name).toLowerCase() === '.webp') {
          const pngTargetPath = targetPath.replace(/\.webp$/i, '.png');
          await convertWebpToPng(sourcePath, pngTargetPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error in copyImagesRecursively for ${sourceDir}:`, error);
  }
}

const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');

/** The files an image set needs in public/images/<package>/: each image and the PNG copy of each WebP image. */
function expectedFiles(images) {
  return images.flatMap((image) => /\.webp$/i.test(image) ? [image, image.replace(/\.webp$/i, '.png')] : [image]);
}

/** Throws when one of `files` is not in `dir`. copyFile and convertWebpToPng only log their errors. */
async function verifyFiles(dir, files, what) {
  const missing = [];
  for (const file of files) {
    try {
      await fs.access(path.join(dir, file));
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    const shown = missing.slice(0, 10).join(', ') + (missing.length > 10 ? ', ...' : '');
    throw new Error(`${what}: ${missing.length} file(s) missing in ${relative(dir)}: ${shown}`);
  }
}

/**
 * Refuses to replace a folder that holds files committed to git: committed images are never
 * deleted. Without git (some build machines have no .git folder) this check is skipped.
 */
function assertNotCommitted(targetDir) {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z', '--', relative(targetDir)], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return;
  }
  if (tracked !== '') {
    throw new Error(`${relative(targetDir)} holds files committed to git. prepareImages never deletes a committed folder.`);
  }
}

/**
 * Copies (or symlinks) the images of one package into public/images/<package>/ with their PNG
 * copies. `source` holds its display data: its imageset.custom.json entry for an active set,
 * its frozen imageset.legacy.json entry for a legacy set.
 */
async function processPackage(packageName, source, legacy, shouldCopy) {
  try {
    const sourceDir = await findImageDirectory(packageName);
    const targetDir = path.join(__dirname, '..', 'public', 'images', packageName);

    console.log(`Processing package: ${packageName}`);
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Target directory: ${targetDir}`);

    assertNotCommitted(targetDir);

    // Remove existing symlink or directory
    try {
      const stats = await fs.lstat(targetDir);
      if (stats.isSymbolicLink() || stats.isDirectory()) {
        await fs.rm(targetDir, {recursive: true, force: true});
        console.log(`Removed existing ${stats.isSymbolicLink() ? 'symlink' : 'directory'}: ${targetDir}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error removing existing item at ${targetDir}:`, error);
      }
    }

    // Ensure the parent directory exists
    await fs.mkdir(path.dirname(targetDir), {recursive: true});

    if (shouldCopy) {
      await copyImagesRecursively(sourceDir, targetDir);
      console.log(`Finished copying ${packageName} images to ${targetDir}`);
    } else {
      await fs.symlink(sourceDir, targetDir, 'dir');
      console.log(`Symlinked ${packageName} images to ${targetDir}`);

      // Process WebP images in the source directory
      await processWebpImages(sourceDir, targetDir);
    }

    const images = await callPackageFunction(packageName, 'getImageList', sourceDir);
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error(`${packageName} has no images. Check that the installed version is complete.`);
    }
    console.log(`Found ${images.length} images in ${packageName}`);
    await verifyFiles(targetDir, expectedFiles(images), packageName);

    const {displayFields} = await imageSets;
    const {displayName} = displayFields(packageName, source);

    return {packageName, displayName, images, source, legacy};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
    console.log(`Logging contents of ${packageName} package due to error:`);
    await logImageSetContents(path.join(__dirname, '..', 'node_modules', packageName))
      .catch((logError) => console.error(`Cannot list node_modules/${packageName}:`, logError.message));
    throw error;
  }
}

/** The version of a package in node_modules, or "unknown". */
async function installedVersion(packageName) {
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(ROOT, 'node_modules', packageName, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function updateConfigs(packagesData, order, legacyConfig) {
  const {buildPackageEntry, frozenEntryDifferences, mergeConfig} = await imageSets;
  const activeEntries = {};
  const changedLegacySets = [];
  for (const {packageName, displayName, images, source, legacy} of packagesData) {
    const metadata = await callPackageFunction(packageName, 'getImageMetadata');
    const entry = buildPackageEntry({packageName, displayName, images, metadata, custom: source});
    if (!legacy) {
      activeEntries[packageName] = entry;
      continue;
    }
    // A legacy set's entry is its frozen one. The pinned package must still build exactly that.
    const differences = frozenEntryDifferences(packageName, entry, legacyConfig[packageName]);
    if (differences.length > 0) {
      const shown = differences.slice(0, 10).map((line) => `  ${line}`).join('\n') + (differences.length > 10 ? `\n  ... ${differences.length - 10} more` : '');
      changedLegacySets.push(`${packageName}@${await installedVersion(packageName)} builds a config entry that differs from its frozen entry in imageset.legacy.json:\n${shown}`);
    } else {
      console.log(`Legacy set ${packageName}: the package builds its frozen config entry`);
    }
  }
  if (changedLegacySets.length > 0) {
    throw new Error(`${changedLegacySets.join('\n')}\nLegacy sets never change: install the exact version they shipped with (npm ci).`);
  }

  const config = mergeConfig(order, activeEntries, legacyConfig);
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Config updated at', CONFIG_PATH);
}

/**
 * The placeholder tile of an unknown item, at preview size for link previews (getOgSafeImageUrl
 * in lib/linkPreview.ts maps /placeholder-image.png to this copy). The app itself shows public/placeholder-image.png.
 */
const PLACEHOLDER = path.join(ROOT, 'public', 'placeholder-image.png');
const PLACEHOLDER_PREVIEW = path.join(ROOT, 'public', 'placeholder-image.preview.png');

async function preparePlaceholderPreview() {
  await fs.rm(PLACEHOLDER_PREVIEW, {force: true});
  await convertWebpToPng(PLACEHOLDER, PLACEHOLDER_PREVIEW);
  await verifyFiles(path.dirname(PLACEHOLDER_PREVIEW), [path.basename(PLACEHOLDER_PREVIEW)], 'The placeholder tile for link previews');
}

async function main() {
  // `--copy` copies the images into public/images. The `prebuild` npm script passes it:
  // npm runs prebuild with NODE_ENV unset, and Vercel and CI builds must copy. Without the
  // flag, production and Vercel copy, and development symlinks into node_modules.
  const isProduction = process.argv.includes('--copy') || process.env.NODE_ENV === 'production' || process.env.VERCEL;
  console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

  const {splitPackages} = await imageSets;
  const customConfig = await getCustomConfig();
  const legacyConfig = await getLegacyConfig();
  const {order, legacy} = splitPackages(customConfig, legacyConfig);
  const isLegacy = (pkg) => legacy.includes(pkg);
  const sourceOf = (pkg) => (isLegacy(pkg) ? legacyConfig[pkg] : customConfig.packages[pkg]);

  await preparePlaceholderPreview();

  // One path for every set: active and legacy sets are copied from node_modules alike.
  const results = await Promise.allSettled(order.map(pkg => processPackage(pkg, sourceOf(pkg), isLegacy(pkg), isProduction)));
  const failed = order.filter((pkg, index) => results[index].status === 'rejected');
  if (failed.length > 0) {
    throw new Error(`Could not prepare ${failed.join(', ')} (see the errors above).`);
  }
  await updateConfigs(results.map(result => result.value), order, legacyConfig);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error('prepareImages failed: imageset.config.json was not updated.');
  process.exitCode = 1;
});
