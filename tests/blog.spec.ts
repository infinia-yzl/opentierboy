import {test, expect} from '@playwright/test';

test('it should be able to visit a blog article', async ({page}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', {name: 'Blog'}).click();
  await page.getByRole('link', {name: 'THE FINALS Season 3 World'}).click();
  await expect(page.getByRole('link', {name: 'THE FINALS S3 - LIGHT All-'})).toBeVisible();
});
