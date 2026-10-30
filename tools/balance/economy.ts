/**
 * Economy simulation: a bot plays the whole campaign in order like a real player would,
 * earns coins, buys upgrades greedily and retries lost levels. Reveals grind walls.
 *
 *   node tools/balance/economy.ts [good|average|poor]
 */
import { createEmptySave, UPGRADE_IDS, type SaveData, type UpgradeId } from '@lsg/shared';
import { CAMPAIGN_LENGTH, campaignLevel } from '../../apps/game/src/data/levels/campaign.ts';
import { modifiersFor, rewardFor, upgradeCost } from '../../apps/game/src/meta/economy.ts';
import { playLevel, type BotSkill } from './bot.ts';

const skill = (process.argv[2] ?? 'average') as BotSkill;
const MAX_ATTEMPTS = 12;
/** Real players do not repeat a failed run move for move: every retry reacts a bit differently. */
const ATTEMPT_LOOKAHEAD = [undefined, 38, 52, 32, 58, 42, 26, 48, 35, 55, 30, 45];
/** Priority when several upgrades are affordable (damage first, coins last). */
const PRIORITY: UpgradeId[] = ['damage', 'squad', 'fireRate', 'speed', 'coins'];

function buyUpgrades(save: SaveData): string[] {
  const bought: string[] = [];
  for (;;) {
    const options = PRIORITY.map((id) => ({ id, cost: upgradeCost(id, save.upgrades[id]) }))
      .filter((o): o is { id: UpgradeId; cost: number } => o.cost !== null && o.cost <= save.coins)
      .sort((a, b) => a.cost - b.cost || PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
    const pick = options[0];
    if (!pick) return bought;
    save.coins -= pick.cost;
    save.upgrades[pick.id] += 1;
    bought.push(pick.id);
  }
}

const save = createEmptySave();
let totalAttempts = 0;
let stuckAt: number | null = null;
for (let n = 1; n <= CAMPAIGN_LENGTH; n++) {
  let attempts = 0;
  let won = false;
  let stars = 0;
  while (!won && attempts < MAX_ATTEMPTS) {
    attempts++;
    const modifiers = modifiersFor(save);
    const lookahead = ATTEMPT_LOOKAHEAD[attempts - 1];
    const result = playLevel(campaignLevel(n), modifiers, skill, skill === 'good' ? undefined : lookahead);
    won = result.status === 'won';
    const reward = rewardFor(save, n, won, result.units, result.stats, modifiers.coinMultiplier);
    save.coins += reward.total;
    if (won) {
      stars = reward.stars;
      save.levels[String(n)] = { stars, bestUnits: result.units, completions: 1 };
    }
    buyUpgrades(save);
  }
  totalAttempts += attempts;
  const upgrades = UPGRADE_IDS.map((id) => `${id[0]}${save.upgrades[id]}`).join(' ');
  console.info(
    `level ${String(n).padStart(2)}: ${won ? 'won ' : 'STUCK'} after ${String(attempts).padStart(2)} attempt(s), stars ${stars}, coins ${String(save.coins).padStart(5)}, upgrades ${upgrades}`,
  );
  if (!won) {
    stuckAt = n;
    break;
  }
}
console.info(
  `total attempts: ${totalAttempts}${stuckAt ? `, stuck at level ${stuckAt}` : ', campaign finished'}`,
);
