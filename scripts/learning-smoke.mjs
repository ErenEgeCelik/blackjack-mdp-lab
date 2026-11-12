import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/#learn');
  await expect(
    page.getByRole('heading', { name: 'Blackjack’i ilk ilkelerden öğren.' }),
  ).toBeVisible();
  await page.getByLabel('İncelenecek el').selectOption('1');
  await expect(page.locator('.learn-cards>strong')).toContainText('17');
  await expect(page.locator('.learn-cards>strong')).toContainText('SERT');
  await page.getByRole('button', { name: 'Normal 21 olarak değerlendirilir', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Doğru.');
  await page.screenshot({ path: 'artifacts/learning-hands.png', fullPage: true });
  await page.getByRole('button', { name: '02 Kartlar ve koşullama' }).click();
  await page.getByRole('button', { name: 'A kartını çıkar', exact: true }).click();
  await expect(page.locator('.learn-metrics')).toContainText('3,76%');
  await page.getByRole('button', { name: 'Desteyi sıfırla' }).click();
  await page.getByRole('button', { name: '10 kartını çıkar', exact: true }).click();
  await expect(page.locator('.learn-metrics')).toContainText('4,71%');
  await page.getByRole('button', { name: '03 EV neden karar verir?' }).click();
  await expect(page.locator('.learn-result>strong')).toContainText('-0,0500');
  await page.getByLabel(/Galibiyette net ödeme/).fill('1.5');
  await expect(page.locator('.learn-result>strong')).toContainText('+0,1750');
  await page.getByRole('button', { name: '04 Bellman ağacı' }).click();
  await expect(page.locator('.learn-equation')).toContainText('0,050');
  await page.getByLabel(/Sol duruma geçiş/).fill('20');
  await expect(page.locator('.learn-equation')).toContainText('DUR');
  await page.screenshot({ path: 'artifacts/learning-bellman.png', fullPage: true });
  await page.getByRole('button', { name: '05 Gerçek motoru karşılaştır' }).click();
  await page.getByRole('button', { name: 'Sonlu desteyi tam sayımla çöz' }).click();
  await expect(page.getByText('Tam sayım tamamlandı.')).toBeVisible();
  await expect(page.locator('.learn-callout')).toContainText('tam sayım stand');
  await page.getByRole('button', { name: '06 Büyüme ve risk' }).click();
  await page.getByLabel(/Her tur servetin/).fill('0');
  await expect(page.locator('.learn-result')).toContainText('Bahis sıfır');
  await page.getByLabel(/Her tur servetin/).fill('10');
  await page.getByLabel(/Kazanma olasılığı/).fill('45');
  await expect(page.locator('.learn-result')).toContainText('parasal avantaj da negatiftir');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown dosyasını indir' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('MATHEMATICS_TUTORIAL_TR.md');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '02 Kartlar ve koşullama' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'artifacts/learning-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    'PASS: six Turkish lessons, ace total, quiz explanation, exact shoe removal, EV payoff control, Bellman threshold, actual exact/frozen solver comparison, Kelly edge cases, tutorial download and mobile layout.',
  );
} finally {
  await browser.close();
}
