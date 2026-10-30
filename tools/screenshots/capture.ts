/**
 * Captures the README screenshots from a running dev server (npm run dev:game).
 * Uses Playwright's Chromium (npx playwright-core install chromium) or an installed Chrome.
 *
 *   node tools/screenshots/capture.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

const OUT = path.resolve('docs/media');
const URL_BASE = process.env.LSG_SCREENSHOT_URL ?? 'http://localhost:5173/';
const BROWSERS = [
  process.env.LSG_BROWSER,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

interface Shot {
  name: string;
  width: number;
  height: number;
  level?: number;
  units?: number;
  /** Seconds of play before the picture. */
  seconds?: number;
  /** Plays until enemies of this kind are close, instead of a fixed time. */
  until?: 'boss' | 'horde';
  screen?: 'shop';
}

const SHOTS: Shot[] = [
  { name: 'menu', width: 1280, height: 720 },
  { name: 'horde', width: 1280, height: 720, level: 4, units: 12, until: 'horde' },
  { name: 'city', width: 1280, height: 720, level: 12, units: 30, until: 'horde' },
  { name: 'boss', width: 1280, height: 720, level: 10, units: 40, until: 'boss' },
  { name: 'station', width: 1280, height: 720, level: 23, units: 45, until: 'horde' },
  { name: 'mobile', width: 430, height: 860, level: 8, units: 18, until: 'horde' },
  { name: 'shop', width: 430, height: 860, screen: 'shop' },
];

type GameHandle = {
  sim: { enemies: { alive: boolean; kind: string; z: number }[]; status: string };
  debugStartLevel: (level: unknown, units?: number) => void;
  debugAdvance: (seconds: number, targetX?: number, renderFrames?: boolean) => unknown;
};
declare global {
  interface Window {
    lsg: GameHandle;
  }
}

async function capture(page: Page, shot: Shot): Promise<void> {
  await page.setViewportSize({ width: shot.width, height: shot.height });
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.lsg !== undefined, undefined, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  if (shot.level) {
    await page.evaluate(
      async ({ level, units, seconds, until }) => {
        const { campaignLevel } = (await import('/src/data/levels/campaign.ts' as string)) as {
          campaignLevel: (n: number) => unknown;
        };
        const game = window.lsg;
        game.debugStartLevel(campaignLevel(level), units);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const ready = () =>
          until === 'boss'
            ? game.sim.enemies.some(
                (e) => e.alive && (e.kind === 'boss' || e.kind === 'miniboss') && e.z > -62,
              )
            : game.sim.enemies.filter((e) => e.alive && e.z > -30).length >= 14;
        for (let i = 0; i < 1200 && game.sim.status === 'running'; i++) {
          if (seconds === undefined && ready()) break;
          game.debugAdvance(0.1, 0, false);
          if (seconds !== undefined && i * 0.1 >= seconds) break;
        }
        game.debugAdvance(0.4, 0, true);
      },
      { level: shot.level, units: shot.units, seconds: shot.seconds, until: shot.until },
    );
    await page.waitForTimeout(600);
  }
  if (shot.screen === 'shop') {
    await page.getByRole('button', { name: 'Shop' }).click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: path.join(OUT, `${shot.name}.jpg`), type: 'jpeg', quality: 86 });
  console.info(`captured ${shot.name}`);
}

const executablePath = BROWSERS.find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) throw new Error('No browser found; set LSG_BROWSER.');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
});
const context = await browser.newContext({ locale: 'en-US' });
await context.addInitScript(() => {
  localStorage.setItem('lsg.settings.v1', JSON.stringify({ locale: 'en', quality: 'high' }));
});
const page = await context.newPage();
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
for (const shot of SHOTS) await capture(page, shot);
await browser.close();
