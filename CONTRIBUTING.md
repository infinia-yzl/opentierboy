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

## Contributing New Images / Image Sets

To contribute new images or image sets to OpenTierBoy, you can either add to existing image sets or create a new one
using our image-set template.
Current Image Sets
We currently have the following image sets that you can contribute to:

- The Finals (image-reachthefinals)
- Wuthering Waves (image-wutheringwaves)
- Overwatch (image-overwatch)

To contribute to these existing image sets, please follow the general contribution guidelines above and make sure to
adhere to any specific guidelines provided in each image set's repository.

### Getting Started with the Image Set Template

1. Visit the [image-set template repository](https://github.com/yourusername/image-set-template).
2. Click on "Use this template" to create a new repository based on the template.
3. Clone your new repository locally.

### Setting Up Your Image Set

1. Install dependencies:
   ```
   npm install
   ```

2. Update the `package.json` file:
    - Change the `name` field to a unique name for your image set
    - Update the `description`, `keywords`, and `author` fields

3. Add your images:
    - Place your images in the `public/images/` directory

4. Process your images:
   ```
   npm run process-images
   ```
   This will run an interactive CLI where you can compress and tag your images.

5. Publish your package:
   ```
   npm run publish-package
   ```

For more detailed instructions on using the image-set template, please refer to its README file.

### Submitting Your Image Set

Once you've published your image set package:

1. Open a pull request to the main OpenTierBoy repository.
2. In your pull request, include:
    - The name of your published npm package
    - A brief description of the image set
    - Any relevant tags or categories for the images

Our team will review your submission and integrate it into the project if it meets our guidelines.

## Reporting Issues

Found a bug or have a suggestion? Open an issue on GitHub:

1. Go to the [Issues](https://github.com/yourusername/opentierboy/issues) tab.
2. Click "New Issue".
3. Choose the appropriate template (Bug Report, Feature Request, or Image Update/Addition).
4. Provide a clear title and detailed description.
5. Add relevant labels if necessary.

Thank you for contributing to OpenTierBoy!
