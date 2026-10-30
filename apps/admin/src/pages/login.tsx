import type { AdminMe } from '@lsg/shared';
import { useState } from 'preact/hooks';
import { api, ApiError } from '../api.ts';
import { ActionFeedback, Field, useAction } from '../components.tsx';

export function LoginPage(props: { onLogin: (me: AdminMe) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const action = useAction();

  const submit = (event: Event) => {
    event.preventDefault();
    void action.run(async () => {
      try {
        const me = await api<AdminMe>('POST', '/api/admin/login', {
          username,
          password,
          code: code || undefined,
        });
        props.onLogin(me);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'totp_required') {
          setNeedsCode(true);
          return;
        }
        throw error;
      }
    });
  };

  return (
    <div class="login-page">
      <form class="card login-card" onSubmit={submit}>
        <h1>LSG Admin</h1>
        <p class="muted">Sign in with your local admin account.</p>
        <Field label="Username">
          <input
            value={username}
            autocomplete="username"
            required
            onInput={(e) => setUsername(e.currentTarget.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            autocomplete="current-password"
            required
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </Field>
        {needsCode && (
          <Field label="Authenticator code">
            <input
              value={code}
              inputMode="numeric"
              autocomplete="one-time-code"
              maxLength={6}
              autoFocus
              onInput={(e) => setCode(e.currentTarget.value)}
            />
          </Field>
        )}
        <ActionFeedback error={action.error} message={action.message} />
        <button class="btn primary" type="submit" disabled={action.busy}>
          {action.busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p class="muted small">
          The first admin is created on the first start. Without LSG_ADMIN_PASSWORD a random password is
          written to
          <code> data/initial-admin-password.txt</code>.
        </p>
      </form>
    </div>
  );
}

export function ChangePasswordPage(props: { forced: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const action = useAction();
  const submit = (event: Event) => {
    event.preventDefault();
    void action.run(async () => {
      if (next !== repeat) throw new Error('The new passwords do not match.');
      await api('POST', '/api/admin/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      props.onDone();
      return 'Password changed. Other sessions were signed out.';
    });
  };
  return (
    <form class="card narrow" onSubmit={submit}>
      <h2>{props.forced ? 'Choose a new password' : 'Change password'}</h2>
      {props.forced && (
        <p class="muted">This account uses a generated password. Set your own before continuing.</p>
      )}
      <Field label="Current password">
        <input
          type="password"
          value={current}
          autocomplete="current-password"
          required
          onInput={(e) => setCurrent(e.currentTarget.value)}
        />
      </Field>
      <Field label="New password" hint="At least 12 characters.">
        <input
          type="password"
          value={next}
          autocomplete="new-password"
          minLength={12}
          required
          onInput={(e) => setNext(e.currentTarget.value)}
        />
      </Field>
      <Field label="Repeat new password">
        <input
          type="password"
          value={repeat}
          autocomplete="new-password"
          required
          onInput={(e) => setRepeat(e.currentTarget.value)}
        />
      </Field>
      <ActionFeedback error={action.error} message={action.message} />
      <button class="btn primary" type="submit" disabled={action.busy}>
        Save password
      </button>
    </form>
  );
}
