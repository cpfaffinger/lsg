import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context.ts';
import { generatePassword, hashPassword } from '../security/crypto.ts';

export const INITIAL_PASSWORD_FILE = 'initial-admin-password.txt';

/**
 * Creates the first admin account if none exists.
 * Credentials come from LSG_ADMIN_USER / LSG_ADMIN_PASSWORD; without a password a random one
 * is generated, printed to the log and written to <data>/initial-admin-password.txt.
 * Generated passwords must be changed on first login.
 */
export async function ensureInitialAdmin(ctx: AppContext): Promise<void> {
  if (ctx.admins.count() > 0) return;
  const username = ctx.config.initialAdminUser ?? 'admin';
  const provided = ctx.config.initialAdminPassword;
  const password = provided ?? generatePassword();
  if (provided && provided.length < 12) {
    throw new Error('LSG_ADMIN_PASSWORD must be at least 12 characters long.');
  }
  ctx.admins.create(username, await hashPassword(password), !provided);
  ctx.audit.log('system', 'admin.created', username, { generated: !provided });
  if (!provided) {
    const file = path.join(ctx.config.dataDir, INITIAL_PASSWORD_FILE);
    fs.mkdirSync(ctx.config.dataDir, { recursive: true });
    fs.writeFileSync(
      file,
      `LSG admin account\nUser: ${username}\nPassword: ${password}\n\nSign in at /admin/ and change the password. This file is deleted afterwards.\n`,
      { mode: 0o600 },
    );
    console.info(
      `Created admin "${username}" with a generated password. See ${file} (change it after the first login).`,
    );
  }
}

export function removeInitialPasswordFile(ctx: AppContext): void {
  fs.rmSync(path.join(ctx.config.dataDir, INITIAL_PASSWORD_FILE), { force: true });
}
