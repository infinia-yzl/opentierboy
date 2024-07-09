const fs = require('fs').promises;
const path = require('path');
const {execSync} = require('child_process');

async function addImageSet(packageName, displayName) {
  // Install the package
  console.log(`Installing ${packageName}...`);
  execSync(`npm install ${packageName}`, {stdio: 'inherit'});

  // Add the package to the configuration
  const configPath = path.join(__dirname, '..', 'imageset.custom.json');
  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create a new config object
      config = {packages: {}};
    } else {
      throw error;
    }
  }

  if (!config.packages[packageName]) {
    config.packages[packageName] = {
      displayName: displayName || packageName
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  // Run prepareImages
  console.log('Preparing images...');
  execSync('npm run prepare-images', {stdio: 'inherit'});

  console.log(`${packageName} has been added and images have been prepared.`);
}

const packageName = process.argv[2];
const displayName = process.argv[3];
if (!packageName) {
  console.error('Please provide a package name.');
  process.exit(1);
}

addImageSet(packageName, displayName).catch(console.error);
