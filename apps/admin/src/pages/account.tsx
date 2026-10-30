import type { AdminAccount, AdminMe } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { renderSVG } from 'uqr';
import { api, formatDate } from '../api.ts';
import { ActionFeedback, Badge, Card, Field, useAction } from '../components.tsx';
import { ChangePasswordPage } from './login.tsx';

export function AccountPage(props: { me: AdminMe; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [newUser, setNewUser] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const totp = useAction();
  const team = useAction();

  const loadAdmins = async () => setAdmins(await api<AdminAccount[]>('GET', '/api/admin/admins'));
  useEffect(() => {
    void loadAdmins();
  }, []);

  return (
    <div class="stack">
      <ChangePasswordPage forced={false} onDone={() => undefined} />

      <Card title="Two-factor authentication">
        <p>
          Status:{' '}
          {props.me.totpEnabled ? <Badge tone="ok">enabled</Badge> : <Badge tone="warn">disabled</Badge>}
        </p>
        {!props.me.totpEnabled && !setup && (
          <button
            class="btn"
            disabled={totp.busy}
            onClick={() =>
              void totp.run(async () => {
                setSetup(await api<{ secret: string; otpauthUrl: string }>('POST', '/api/admin/totp/setup'));
              })
            }
          >
            Set up authenticator app
          </button>
        )}
        {setup && !props.me.totpEnabled && (
          <div class="totp-setup">
            <div
              class="qr"
              dangerouslySetInnerHTML={{ __html: renderSVG(setup.otpauthUrl, { border: 2 }) }}
            />
            <div>
              <p>Scan the code with an authenticator app, or enter this key manually:</p>
              <code class="secret">{setup.secret}</code>
              <Field label="Code from the app">
                <input
                  value={code}
                  inputMode="numeric"
                  maxLength={6}
                  onInput={(e) => setCode(e.currentTarget.value)}
                />
              </Field>
              <button
                class="btn primary"
                disabled={totp.busy}
                onClick={() =>
                  void totp.run(async () => {
                    await api('POST', '/api/admin/totp/enable', { code });
                    setSetup(null);
                    setCode('');
                    props.onChanged();
                    return 'Two-factor authentication is enabled.';
                  })
                }
              >
                Confirm
              </button>
            </div>
          </div>
        )}
        {props.me.totpEnabled && (
          <div class="row">
            <input
              type="password"
              placeholder="Current password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
            <button
              class="btn danger"
              disabled={totp.busy}
              onClick={() =>
                void totp.run(async () => {
                  await api('POST', '/api/admin/totp/disable', { password });
                  setPassword('');
                  props.onChanged();
                  return 'Two-factor authentication is disabled.';
                })
              }
            >
              Disable
            </button>
          </div>
        )}
        <ActionFeedback error={totp.error} message={totp.message} />
      </Card>

      <Card title="Admin accounts">
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th>2FA</th>
              <th>Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.username}</td>
                <td>{a.totpEnabled ? <Badge tone="ok">on</Badge> : <Badge tone="neutral">off</Badge>}</td>
                <td class="small">{formatDate(a.lastLoginAt)}</td>
                <td>
                  {a.id !== props.me.id && (
                    <button
                      class="btn small danger"
                      onClick={() => {
                        if (!window.confirm(`Delete admin "${a.username}"?`)) return;
                        void team.run(async () => {
                          await api('DELETE', `/api/admin/admins/${a.id}`);
                          await loadAdmins();
                          return 'Admin deleted.';
                        });
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            void team.run(async () => {
              await api('POST', '/api/admin/admins', { username: newUser, password: newPassword });
              setNewUser('');
              setNewPassword('');
              await loadAdmins();
              return 'Admin created. They must change the password on first login.';
            });
          }}
        >
          <input placeholder="Username" value={newUser} onInput={(e) => setNewUser(e.currentTarget.value)} />
          <input
            type="password"
            placeholder="Initial password (12+ characters)"
            value={newPassword}
            onInput={(e) => setNewPassword(e.currentTarget.value)}
          />
          <button class="btn" type="submit" disabled={team.busy}>
            Add admin
          </button>
        </form>
        <ActionFeedback error={team.error} message={team.message} />
      </Card>
    </div>
  );
}
