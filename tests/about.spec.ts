import {test, expect} from '@playwright/test';

test('it should be able to visit about page', async ({page}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole("link", {name: "About"}).click();
  await expect(page.locator("main")).toBeVisible();

  const h3CommunityDrivenOpenSource = page.getByRole("heading", {name: "Community Driven & Open-Source"})
  const h3AdFreeExperience = page.getByRole("heading", {name: "Ad-Free Experience"})
  const h3EasySharing = page.getByRole("heading", {name: "Easy Sharing"})
  const h3Customizable = page.getByRole("heading", {name: "Customizable"})

  await expect(h3CommunityDrivenOpenSource).toBeVisible();
  await expect(h3AdFreeExperience).toBeVisible();
  await expect(h3EasySharing).toBeVisible();
  await expect(h3Customizable).toBeVisible();
});
