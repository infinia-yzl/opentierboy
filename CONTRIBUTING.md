# Contributing to OpenTierBoy

We welcome contributions to OpenTierBoy! Here's how you can help forge the legend:

## General Contributions

1. **Fork the Repository**: Create your own fork of the project.
2. **Clone**: `git clone https://github.com/your-username/opentierboy.git`
3. **Create a Branch**: `git checkout -b feature/AmazingFeature`
4. **Make Changes**: Implement your feature or bug fix.
5. **Commit**: `git commit -m 'Add some AmazingFeature'`
6. **Push**: `git push origin feature/AmazingFeature`
7. **Open a Pull Request**: Submit your changes for review.

### Contribution Guidelines

- Ensure your code adheres to the project's coding standards.
- Write clear, concise commit messages.
- If adding a new feature, please include relevant information and documentation.
- Be respectful and constructive in discussions and code reviews.

## Contributing Images

OpenTierBoy has two kinds of image sets: official sets, which keep growing, and legacy sets,
which are frozen.

### Official image sets

The official image sets are THE FINALS and OVERWATCH. Each one lives in its own repository and
is published as an npm package:

- THE FINALS (`image-reachthefinals`): https://github.com/infinia-yzl/image-reachthefinals
- OVERWATCH (`image-overwatch`): https://github.com/infinia-yzl/image-overwatch

To add, fix, label or tag images, open a pull request in that set's repository and follow its
README. Its CI checks every image (`npm run validate`), and a pull request that changes published
images also raises the `version` in `package.json`. A weekly workflow there collects new images
from the game's wiki and opens a pull request for them, so check the open pull requests first.

After the owner merges your pull request, the set's `release.yml` workflow publishes the new
version to npm and tells OpenTierBoy. OpenTierBoy's `image-set-update` workflow then opens a pull
request in this repository, and the owner reviews and merges it. You do not need to open a pull
request here for image changes.

Published images are never renamed or removed: their ids appear in shared links.

### Legacy image sets

SUPERVIVE, WUTHERING WAVES, HELLDIVERS 2, Web Development Technologies and the Example Items
Template are legacy sets. They are frozen: their images are kept in this repository, they take no
new contributions, and the app no longer offers them. Links that already use them keep working.
Please do not open pull requests or issues to change them, here or in their old repositories.

### New image sets

A new set starts from the [image-set template](https://github.com/infinia-yzl/image-set), version
2.2.0 or later. Its README covers the setup, the checks and the release workflow. The interactive
`npm run publish-package` script of older template versions is gone: image sets publish from
GitHub Actions (`release.yml`) only.

Before you publish anything, propose the set in an issue (**Image Update or Addition**
template). If the owner accepts it, it joins the official sets in a pull request here.

## Reporting Issues

Found a bug or have a suggestion? Open an issue on GitHub:

1. Go to the [Issues](https://github.com/yourusername/opentierboy/issues) tab.
2. Click "New Issue".
3. Choose the appropriate template (Bug Report, Feature Request, or Image Update/Addition).
4. Provide a clear title and detailed description.
5. Add relevant labels if necessary.

Thank you for contributing to OpenTierBoy!
