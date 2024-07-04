const fs = require('fs').promises;
const path = require('path');

async function getPackages() {
  const configPath = path.join(__dirname, '..', 'imageset.config.json');
  const config = await fs.readFile(configPath, 'utf8');
  return JSON.parse(config).packages;
}

async function removeExistingSymlinks() {
  const imagesDir = path.join(__dirname, '..', 'public', 'images');
  try {
    const entries = await fs.readdir(imagesDir, {withFileTypes: true});
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        await fs.unlink(path.join(imagesDir, entry.name));
        console.log(`Removed symlink: ${entry.name}`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error removing existing symlinks:', error);
    }
  }
}

async function symlinkPackage(packageName) {
  const sourceDir = path.join(__dirname, '..', 'node_modules', packageName, 'public', 'images', packageName);
  const targetDir = path.join(__dirname, '..', 'public', 'images', packageName);

  try {
    // Ensure the target directory exists
    await fs.mkdir(path.dirname(targetDir), {recursive: true});

    // Create symlink
    await fs.symlink(sourceDir, targetDir, 'dir');
    console.log(`Symlinked ${packageName} images to ${targetDir}`);

    // Get list of images (including those in subfolders)
    const images = await getImagesRecursively(sourceDir);
    return {packageName, images};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
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
  await removeExistingSymlinks();
  const packages = await getPackages();
  const packagesData = await Promise.all(packages.map(symlinkPackage));
  await updateConfig(packagesData);
}

main().catch(console.error);
