import type { GoogleCheck, GoogleSettingsState, GoogleSetupGuide } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, formatDate } from '../api.ts';
import { ActionFeedback, Badge, Card, CopyField, Field, Notice, useAction } from '../components.tsx';

const WARNING_TEXT: Record<string, string> = {
  public_url_not_set:
    'The public URL is not stored yet. The values below use the address of this browser tab. Set the public URL first (step 1).',
  public_url_not_https:
    'Google only accepts HTTPS redirect URIs. Make sure your proxy (e.g. Cloudflare) serves the game over HTTPS.',
  localhost_only:
    'localhost works for local tests only. Players on other devices need the real public address.',
};

/**
 * Step-by-step assistant: tells the admin exactly what to enter in the Google Cloud Console,
 * derived from the configured public URL, then stores the credentials and runs a test sign-in.
 */
export function GooglePage(props: { query: URLSearchParams }) {
  const [guide, setGuide] = useState<GoogleSetupGuide | null>(null);
  const [state, setState] = useState<GoogleSettingsState | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [checks, setChecks] = useState<GoogleCheck[] | null>(null);
  const save = useAction();
  const check = useAction();
  const testResult = props.query.get('test');

  const load = async () => {
    const [g, s] = await Promise.all([
      api<GoogleSetupGuide>('GET', '/api/admin/google/setup'),
      api<{ google: GoogleSettingsState }>('GET', '/api/admin/settings'),
    ]);
    setGuide(g);
    setState(s.google);
    setClientId(s.google.clientId ?? '');
  };

  useEffect(() => {
    void load();
  }, []);

  if (!guide || !state) return <p class="muted">Loading…</p>;

  const store = (enabled: boolean) =>
    save.run(async () => {
      const next = await api<GoogleSettingsState>('PUT', '/api/admin/settings/google', {
        clientId: clientId.trim() || null,
        clientSecret: clientSecret.trim() || null,
        enabled,
      });
      setState(next);
      setClientSecret('');
      return enabled ? 'Saved. Google sign-in is now active for players.' : 'Saved.';
    });

  return (
    <div class="stack wizard">
      {testResult === 'ok' && (
        <Notice tone="ok">Test sign-in succeeded. Google is configured correctly.</Notice>
      )}
      {testResult === 'failed' && (
        <Notice tone="bad">
          Test sign-in failed: {state.lastTest?.error ?? 'unknown error'}. Check the values below.
        </Notice>
      )}
      {testResult === 'incomplete' && (
        <Notice tone="warn">Enter and save client ID and secret before testing.</Notice>
      )}
      {guide.warnings.map((w) => (
        <Notice key={w} tone="warn">
          {WARNING_TEXT[w] ?? w}
        </Notice>
      ))}

      <Card title="1. Public address">
        <p>
          All values are derived from the public URL <code>{guide.publicUrl}</code>{' '}
          <Badge tone={guide.publicUrlSource === 'settings' ? 'ok' : 'warn'}>{guide.publicUrlSource}</Badge>.
        </p>
        <a class="btn small" href="#/settings">
          Change public URL
        </a>
      </Card>

      <Card title="2. Create a Google Cloud project and consent screen">
        <ol class="steps">
          <li>
            Open the{' '}
            <a href={guide.consoleUrls.newProject} target="_blank" rel="noreferrer">
              Google Cloud Console
            </a>{' '}
            and create a project (any name, e.g. "LSG").
          </li>
          <li>
            Open{' '}
            <a href={guide.consoleUrls.consentScreen} target="_blank" rel="noreferrer">
              Google Auth Platform → Branding
            </a>{' '}
            and configure the consent screen: app name, support e-mail, audience <strong>External</strong>.
          </li>
        </ol>
        <CopyField label="App home page" value={guide.homePageUrl} />
        <CopyField
          label="Privacy policy link"
          value={guide.privacyPolicyUrl}
          hint="The game shows the privacy text from the Legal settings at this address."
        />
        <CopyField label="Authorized domain" value={guide.authorizedDomain} />
        <CopyField
          label="Scopes (Data access)"
          value={guide.scopes.join(' ')}
          hint="These are non-sensitive scopes; no Google review is needed."
        />
        <p class="muted small">
          While the app is in "Testing" status only listed test users can sign in. Publish the app ("In
          production") when you are ready for all players.
        </p>
      </Card>

      <Card title="3. Create the OAuth client">
        <ol class="steps">
          <li>
            Open{' '}
            <a href={guide.consoleUrls.credentials} target="_blank" rel="noreferrer">
              APIs &amp; Services → Credentials
            </a>{' '}
            → Create credentials → OAuth client ID.
          </li>
          <li>
            Application type: <strong>Web application</strong>.
          </li>
          <li>Enter exactly these values:</li>
        </ol>
        <CopyField label="Authorized JavaScript origin" value={guide.javascriptOrigin} />
        <CopyField
          label="Authorized redirect URI"
          value={guide.redirectUri}
          hint="Must match character for character, including https and without a trailing slash."
        />
      </Card>

      <Card title="4. Enter the credentials">
        <Field label="Client ID" hint="Looks like 1234567890-abc….apps.googleusercontent.com">
          <input value={clientId} spellcheck={false} onInput={(e) => setClientId(e.currentTarget.value)} />
        </Field>
        <Field
          label="Client secret"
          hint={
            state.hasSecret
              ? 'A secret is stored (encrypted). Leave empty to keep it.'
              : 'Stored encrypted in the database.'
          }
        >
          <input
            type="password"
            value={clientSecret}
            autocomplete="off"
            placeholder={state.hasSecret ? '••••••••••••' : ''}
            onInput={(e) => setClientSecret(e.currentTarget.value)}
          />
        </Field>
        <ActionFeedback error={save.error} message={save.message} />
        <div class="row">
          <button class="btn" disabled={save.busy} onClick={() => void store(state.enabled)}>
            Save
          </button>
        </div>
      </Card>

      <Card title="5. Test and enable">
        <div class="row">
          <button
            class="btn"
            disabled={check.busy}
            onClick={() =>
              void check.run(async () => {
                setChecks(await api<GoogleCheck[]>('POST', '/api/admin/google/check'));
              })
            }
          >
            Run checks
          </button>
          <a class="btn" href="/api/admin/google/test-login">
            Test sign-in with Google
          </a>
        </div>
        {checks && (
          <ul class="checks">
            {checks.map((c) => (
              <li key={c.id}>
                {c.ok ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">fix</Badge>} {c.message}
              </li>
            ))}
          </ul>
        )}
        <ActionFeedback error={check.error} message={null} />
        <p>
          Last test:{' '}
          {state.lastTest ? (
            <>
              {state.lastTest.ok ? <Badge tone="ok">succeeded</Badge> : <Badge tone="bad">failed</Badge>}{' '}
              {formatDate(state.lastTest.at)} {state.lastTest.email && `(${state.lastTest.email})`}
            </>
          ) : (
            'not run yet'
          )}
        </p>
        <p>
          Player sign-in:{' '}
          {state.active ? <Badge tone="ok">enabled</Badge> : <Badge tone="neutral">disabled</Badge>}
        </p>
        <div class="row">
          {state.enabled ? (
            <button class="btn danger" disabled={save.busy} onClick={() => void store(false)}>
              Disable Google sign-in
            </button>
          ) : (
            <button
              class="btn primary"
              disabled={save.busy || !state.clientId || !state.hasSecret}
              onClick={() => void store(true)}
            >
              Enable Google sign-in for players
            </button>
          )}
        </div>
        {!state.lastTest?.ok && !state.enabled && (
          <p class="muted small">
            Tip: run the test sign-in first. Enabling shows the sign-in button to all players.
          </p>
        )}
      </Card>
    </div>
  );
}
