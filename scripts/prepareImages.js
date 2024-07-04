const fs = require('fs').promises;
const path = require('path');

async function getPackages() {
  const configPath = path.join(__dirname, '..', 'imageset.config.json');
  const config = await fs.readFile(configPath, 'utf8');
  return JSON.parse(config).packages;
}

async function removeExistingItems() {
  const imagesDir = path.join(__dirname, '..', 'public', 'images');
  try {
    const entries = await fs.readdir(imagesDir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(imagesDir, entry.name);
      if (entry.isSymbolicLink() || entry.isDirectory()) {
        await fs.rm(fullPath, {recursive: true, force: true});
        console.log(`Removed ${entry.isSymbolicLink() ? 'symlink' : 'directory'}: ${entry.name}`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error removing existing items:', error);
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
      console.log(`Found image directory for ${packageName}: ${dir}`);
      return dir;
    } catch (error) {
      console.log(`Directory not found: ${dir}`);
    }
  }

  throw new Error(`Could not find image directory for package: ${packageName}`);
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
      await fs.rm(targetDir, {recursive: true, force: true});
      console.log(`Removed existing item at ${targetDir}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error removing existing item at ${targetDir}:`, error);
      }
    }

    // Ensure the parent directory exists
    await fs.mkdir(path.dirname(targetDir), {recursive: true});

    if (shouldCopy) {
      await copyImagesRecursively(sourceDir, targetDir);
      console.log(`Copied ${packageName} images to ${targetDir}`);
    } else {
      await fs.symlink(sourceDir, targetDir, 'dir');
      console.log(`Symlinked ${packageName} images to ${targetDir}`);
    }

    const images = await getImagesRecursively(sourceDir);
    console.log(`Found ${images.length} images in ${packageName}`);
    return {packageName, images};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
    return {packageName, images: []};
  }
}

async function copyImagesRecursively(sourceDir, targetDir) {
  try {
    const entries = await fs.readdir(sourceDir, {withFileTypes: true});

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(targetPath, {recursive: true});
        await copyImagesRecursively(sourcePath, targetPath);
      } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name)) {
        try {
          await fs.copyFile(sourcePath, targetPath);
          console.log(`Copied: ${sourcePath} -> ${targetPath}`);
        } catch (error) {
          console.error(`Error copying file ${sourcePath}:`, error);
          // Don't throw the error, continue with other files
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${sourceDir}:`, error);
    // Don't throw the error, allow the script to continue
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

async function main() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

  const imageSetPath = path.join(__dirname, '..', 'node_modules', 'image-set');
  console.log('Logging contents of image-set package:');
  try {
    await logImageSetContents(imageSetPath);
  } catch (error) {
    console.error('Error logging image-set contents:', error);
  }

  await removeExistingItems();
  const packages = await getPackages();
  const packagesData = await Promise.all(packages.map(pkg => processPackage(pkg, isProduction)));
  await updateConfig(packagesData);
}

main().catch(console.error);
