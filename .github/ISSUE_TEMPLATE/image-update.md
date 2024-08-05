---
name: Image Update or Addition
about: Template for updating or adding project images
title: "[Image Update/Addition] "
labels: images
---

## Description

Link to new image template repository: https://github.com/username/repo

## Checklist

Please ensure all the following items are completed before submitting this issue:

- [ ] Have compressed images
- [ ] Have tagged images
- [ ] Have published on npm with passing statuses

## Status

<!-- Replace the placeholders in the URLs with your actual repository and package names -->

![CI Status](https://img.shields.io/github/actions/workflow/status/username/package-name/ci.yml)
![npm version](https://img.shields.io/npm/v/package-name)

## Contribution Agreement

By submitting this issue, I confirm that:

- [ ] I have read and agree to the terms in the project's [LICENSE](../../LICENSE) file.
- [ ] I have the right to contribute these images under the project's license.
- [ ] My contribution complies with the project's license, including any source availability requirements.
- [ ] I am responsible for ensuring my contribution doesn't infringe on third-party rights.
- [ ] If applicable, I can justify fair use for any copyrighted content I'm contributing.

## Next Steps

After creating this issue:

1. Fork the repository
2. Create a new branch for your changes
3. Add or update the images as described
    1. To add a new image set, simply run `npm run add-image-set <package-name>` where `<package-name>` is the name of
       the npm package of your new image set
    2. Update the new image set in `./imageset.custom.json` with a good display name and any other customizations
4. Test your changes
5. Open a Pull Request linking back to this issue
