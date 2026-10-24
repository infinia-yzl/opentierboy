/**
 * Prepares the image sets before `next dev` and `next build` (npm scripts `dev` and `prebuild`):
 * copies (or, in development, symlinks) the images of each image-* package into
 * public/images/<package>/, makes a PNG copy of every WebP image for link previews, and writes
 * imageset.config.json.
 *
 * It stops with exit code 1, and leaves imageset.config.json as it was, when a package is
 * missing, has no images, or an image or its PNG copy did not reach public/images/. It never
 * deletes a folder that holds committed files.
 */
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const {execFileSync} = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'imageset.config.json');
const CUSTOM_CONFIG_PATH = path.join(ROOT, 'imageset.custom.json');

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

async function convertWebpToPng(sourcePath, targetPath) {
  try {
    await sharp(sourcePath)
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

async function processPackage(packageName, customConfig, shouldCopy) {
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

    // Get display name from custom config or fallback to package name
    const displayName = customConfig.packages[packageName]?.displayName || packageName;

    return {packageName, displayName, images};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
    console.log(`Logging contents of ${packageName} package due to error:`);
    await logImageSetContents(path.join(__dirname, '..', 'node_modules', packageName))
      .catch((logError) => console.error(`Cannot list node_modules/${packageName}:`, logError.message));
    throw error;
  }
}

async function updateConfigs(packagesData, customConfig) {
  const config = {
    packages: {}
  };

  // Process package data
  for (const {packageName, displayName, images} of packagesData) {
    const packageTags = {};
    // Use the dynamic function call for getImageMetadata
    const metadata = await callPackageFunction(packageName, 'getImageMetadata');
    const packageImages = images.map(image => {
      const imageMetadata = metadata.find(m => m.filename === image);
      const imageTags = imageMetadata?.tags || [];
      imageTags.forEach(tag => {
        if (!packageTags[tag.name]) {
          packageTags[tag.name] = {
            title: tag.title || `${tag.name} for ${displayName}`,
            description: tag.description || `Description of ${tag.name} in ${displayName}`,
            category: tag.category || 'general'
          };
        }
      });
      return {
        filename: image,
        label: imageMetadata?.label || image,
        tags: imageTags.map(tag => tag.name)
      };
    });

    config.packages[packageName] = {
      displayName,
      images: packageImages,
      tags: packageTags,
      // Only include googleFont and backgroundImage if they exist in customConfig
      ...(customConfig.packages[packageName]?.googleFont && {googleFont: customConfig.packages[packageName].googleFont}),
      ...(customConfig.packages[packageName]?.backgroundImage && {backgroundImage: customConfig.packages[packageName].backgroundImage})
    };
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Config updated at', CONFIG_PATH);

  // Update custom config (if needed)
  let customConfigUpdated = false;
  Object.keys(config.packages).forEach(packageName => {
    if (!customConfig.packages[packageName]) {
      customConfig.packages[packageName] = {
        displayName: config.packages[packageName].displayName,
        googleFont: config.packages[packageName].googleFont,
        backgroundImage: config.packages[packageName].backgroundImage
      };
      customConfigUpdated = true;
    }
  });

  if (customConfigUpdated) {
    await fs.writeFile(CUSTOM_CONFIG_PATH, JSON.stringify(customConfig, null, 2));
    console.log('Custom config updated at', CUSTOM_CONFIG_PATH);
  }
}

async function main() {
  // `--copy` copies the images into public/images. The `prebuild` npm script passes it:
  // npm runs prebuild with NODE_ENV unset, and Vercel and CI builds must copy. Without the
  // flag, production and Vercel copy, and development symlinks into node_modules.
  const isProduction = process.argv.includes('--copy') || process.env.NODE_ENV === 'production' || process.env.VERCEL;
  console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

  const customConfig = await getCustomConfig();
  const packages = Object.keys(customConfig.packages);
  const results = await Promise.allSettled(packages.map(pkg => processPackage(pkg, customConfig, isProduction)));
  const failed = packages.filter((pkg, index) => results[index].status === 'rejected');
  if (failed.length > 0) {
    throw new Error(`Could not prepare ${failed.join(', ')} (see the errors above).`);
  }
  await updateConfigs(results.map(result => result.value), customConfig);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error('prepareImages failed: imageset.config.json was not updated.');
  process.exitCode = 1;
});
