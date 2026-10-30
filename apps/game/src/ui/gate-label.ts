import { FACTOR_STEPS } from '../sim/balance.ts';
import type { GateOp, WeaponId } from '../sim/types.ts';
import { t } from '../i18n/i18n.ts';

const MINUS = '−';

/** Text shown on a gate: a big value and an optional caption. */
export function formatGateLabel(
  op: GateOp,
  value: number,
  weapon: WeaponId | null,
): { main: string; sub: string | null } {
  switch (op) {
    case 'units':
      return { main: value >= 0 ? `+${value}` : `${MINUS}${Math.abs(value)}`, sub: null };
    case 'factor': {
      const factor = FACTOR_STEPS[value] ?? 1;
      if (factor >= 1) return { main: `×${factor}`, sub: null };
      return { main: `÷${Math.round(1 / factor)}`, sub: null };
    }
    case 'damage':
      return {
        main: value >= 0 ? `+${value}%` : `${MINUS}${Math.abs(value)}%`,
        sub: t('gate.damage'),
      };
    case 'fireRate':
      return {
        main: value >= 0 ? `+${value}%` : `${MINUS}${Math.abs(value)}%`,
        sub: t('gate.fireRate'),
      };
    case 'weapon':
      return { main: t(`weapon.${weapon ?? 'rifle'}`), sub: t('gate.weapon') };
  }
}
