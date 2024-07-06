const fs = require('fs').promises;
const path = require('path');
const {execSync} = require('child_process');

async function addImageSet(packageName) {
  // Install the package
  console.log(`Installing ${packageName}...`);
  execSync(`npm install ${packageName}`, {stdio: 'inherit'});

  // Add the package to the configuration
  const configPath = path.join(__dirname, '..', 'imageset.config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (!config.packages.includes(packageName)) {
    config.packages.push(packageName);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  // Run prepareImages
  console.log('Preparing images...');
  execSync('npm run prepare-images', {stdio: 'inherit'});

  console.log(`${packageName} has been added and images have been prepared.`);
}

const packageName = process.argv[2];
if (!packageName) {
  console.error('Please provide a package name.');
  process.exit(1);
}

addImageSet(packageName).catch(console.error);
