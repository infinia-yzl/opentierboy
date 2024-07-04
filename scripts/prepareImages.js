const fs = require('fs').promises;
const path = require('path');

async function getPackages() {
  const configPath = path.join(__dirname, '..', 'imageset.config.json');
  const config = await fs.readFile(configPath, 'utf8');
  return JSON.parse(config).packages;
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
    path.join(__dirname, '..', 'node_modules', packageName, 'public', 'images', packageName),
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
        console.log(`Attempting to copy: ${sourcePath} -> ${targetPath}`);
        await copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    console.error(`Error in copyImagesRecursively for ${sourceDir}:`, error);
  }
}

async function processPackage(packageName, shouldCopy) {
  try {
    const sourceDir = await findImageDirectory(packageName);
    const targetDir = path.join(__dirname, '..', 'public', 'images', packageName);

    console.log(`Processing package: ${packageName}`);
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Target directory: ${targetDir}`);

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
    }

    const images = await getImagesRecursively(sourceDir);
    console.log(`Found ${images.length} images in ${packageName}`);
    return {packageName, images};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
    console.log(`Logging contents of ${packageName} package due to error:`);
    await logImageSetContents(path.join(__dirname, '..', 'node_modules', packageName));
    return {packageName, images: []};
  }
}

async function getImagesRecursively(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  const files = await Promise.all(entries.map(entry => {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return getImagesRecursively(res, baseDir);
    } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name)) {
      return path.relative(baseDir, res);
    }
  }));
  return files.flat().filter(Boolean);
}

async function updateConfig(packagesData) {
  const configPath = path.join(__dirname, '..', 'imageset.config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  config.packageImages = packagesData;
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  console.log('Config updated at', configPath);
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

  const packages = await getPackages();
  const packagesData = await Promise.all(packages.map(pkg => processPackage(pkg, isProduction)));
  await updateConfig(packagesData);
}

main().catch(console.error);
