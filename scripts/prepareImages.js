const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, '..', 'imageset.config.json');
const CUSTOM_CONFIG_PATH = path.join(__dirname, '..', 'imageset.custom.json');

async function callPackageFunction(packageName, functionName, ...args) {
  try {
    const packageModule = await import(packageName);
    if (typeof packageModule[functionName] === 'function') {
      return packageModule[functionName](...args);
    } else {
      throw new Error(`Function ${functionName} not found in package ${packageName}`);
    }
  } catch (error) {
    console.error(`Error calling ${functionName} from ${packageName}:`, error);
    return null;
  }
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
        console.log(`Attempting to copy: ${sourcePath} -> ${targetPath}`);
        await copyFile(sourcePath, targetPath);
      }
    }
  } catch (error) {
    console.error(`Error in copyImagesRecursively for ${sourceDir}:`, error);
  }
}

async function processPackage(packageName, customConfig, shouldCopy) {
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

    const images = await callPackageFunction(packageName, 'getImageList', sourceDir);
    console.log(`Found ${images.length} images in ${packageName}`);

    // Get display name from custom config or fallback to package name
    const displayName = customConfig.packages[packageName]?.displayName || packageName;

    return {packageName, displayName, images};
  } catch (error) {
    console.error(`Error processing ${packageName}:`, error);
    console.log(`Logging contents of ${packageName} package due to error:`);
    await logImageSetContents(path.join(__dirname, '..', 'node_modules', packageName));
    return {packageName, displayName: packageName, images: []};
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
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);

  const customConfig = await getCustomConfig();
  const packages = Object.keys(customConfig.packages);
  const packagesData = await Promise.all(packages.map(pkg => processPackage(pkg, customConfig, isProduction)));
  await updateConfigs(packagesData, customConfig);
}

main().catch(console.error);
