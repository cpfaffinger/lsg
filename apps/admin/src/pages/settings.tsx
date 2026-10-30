import type { AdminSettingsResponse, PublicUrlState } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, errorMessage } from '../api.ts';
import { ActionFeedback, Badge, Card, Field, Notice, useAction } from '../components.tsx';

export function SettingsPage() {
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [maintenance, setMaintenance] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [imprint, setImprint] = useState('');
  const [privacy, setPrivacy] = useState('');
  const urlAction = useAction();
  const gameAction = useAction();
  const legalAction = useAction();

  const load = async () => {
    try {
      const settings = await api<AdminSettingsResponse>('GET', '/api/admin/settings');
      setData(settings);
      setPublicUrl(settings.publicUrl.stored ?? '');
      setMaintenance(settings.game.maintenanceMode);
      setAnnouncement(settings.game.announcement ?? '');
      setImprint(settings.legal.imprint ?? '');
      setPrivacy(settings.legal.privacy ?? '');
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <Notice tone="bad">{loadError}</Notice>;
  if (!data) return <p class="muted">Loading…</p>;

  const saveUrl = (value: string | null) =>
    urlAction.run(async () => {
      const state = await api<PublicUrlState>('PUT', '/api/admin/settings/public-url', { publicUrl: value });
      setData({ ...data, publicUrl: state });
      setPublicUrl(state.stored ?? '');
      return value
        ? 'Public URL saved. Check the Google setup assistant if the address changed.'
        : 'Public URL cleared.';
    });

  return (
    <div class="stack">
      <Card title="Public URL">
        <p>
          The address players use to open the game, for example <code>https://lsg.example.com</code>. TLS and
          the domain are handled by your reverse proxy (e.g. Cloudflare); this server only needs to know the
          final address. It is used for Google redirect URIs, secure cookies and links.
        </p>
        <p class="small">
          Effective: <code>{data.publicUrl.url}</code>{' '}
          <Badge tone={data.publicUrl.source === 'settings' ? 'ok' : 'warn'}>{data.publicUrl.source}</Badge>
        </p>
        <Field label="Public URL" hint={`This browser tab uses ${data.publicUrl.detected}.`}>
          <input
            value={publicUrl}
            placeholder="https://lsg.example.com"
            spellcheck={false}
            onInput={(e) => setPublicUrl(e.currentTarget.value)}
          />
        </Field>
        <ActionFeedback error={urlAction.error} message={urlAction.message} />
        <div class="row">
          <button
            class="btn primary"
            disabled={urlAction.busy}
            onClick={() => void saveUrl(publicUrl.trim() || null)}
          >
            Save
          </button>
          <button class="btn" disabled={urlAction.busy} onClick={() => setPublicUrl(data.publicUrl.detected)}>
            Use this tab's address
          </button>
          {data.publicUrl.stored && (
            <button class="btn ghost" disabled={urlAction.busy} onClick={() => void saveUrl(null)}>
              Clear
            </button>
          )}
        </div>
      </Card>

      <Card title="Game">
        <label class="toggle-row">
          <input
            type="checkbox"
            checked={maintenance}
            onChange={(e) => setMaintenance(e.currentTarget.checked)}
          />
          <span>
            Maintenance mode <span class="muted small">(blocks new sign-ins; guests can keep playing)</span>
          </span>
        </label>
        <Field
          label="Announcement"
          hint="Shown in the game's main menu. Leave empty for none. Max. 500 characters."
        >
          <textarea
            rows={2}
            maxLength={500}
            value={announcement}
            onInput={(e) => setAnnouncement(e.currentTarget.value)}
          />
        </Field>
        <ActionFeedback error={gameAction.error} message={gameAction.message} />
        <button
          class="btn primary"
          disabled={gameAction.busy}
          onClick={() =>
            void gameAction.run(async () => {
              await api('PUT', '/api/admin/settings/game', {
                maintenanceMode: maintenance,
                announcement: announcement.trim() || null,
              });
              return 'Game settings saved.';
            })
          }
        >
          Save
        </button>
      </Card>

      <Card title="Legal texts">
        <Notice tone="info">
          The defaults describe what LSG does with data. Replace the placeholders with your details and have
          the texts reviewed for your country before going live. Leave a field empty to use the default.
        </Notice>
        <Field label="Imprint">
          <textarea
            rows={8}
            value={imprint}
            placeholder={data.legal.defaultImprint}
            onInput={(e) => setImprint(e.currentTarget.value)}
          />
        </Field>
        <Field label="Privacy policy">
          <textarea
            rows={12}
            value={privacy}
            placeholder={data.legal.defaultPrivacy}
            onInput={(e) => setPrivacy(e.currentTarget.value)}
          />
        </Field>
        <ActionFeedback error={legalAction.error} message={legalAction.message} />
        <div class="row">
          <button
            class="btn primary"
            disabled={legalAction.busy}
            onClick={() =>
              void legalAction.run(async () => {
                await api('PUT', '/api/admin/settings/legal', {
                  imprint: imprint || null,
                  privacy: privacy || null,
                });
                return 'Legal texts saved.';
              })
            }
          >
            Save
          </button>
          <button
            class="btn"
            onClick={() => {
              if (!imprint) setImprint(data.legal.defaultImprint);
              if (!privacy) setPrivacy(data.legal.defaultPrivacy);
            }}
          >
            Start from defaults
          </button>
        </div>
      </Card>
    </div>
  );
}
