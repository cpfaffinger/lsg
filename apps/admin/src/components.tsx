import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { errorMessage } from './api.ts';

export function Card(props: {
  title?: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  tone?: 'warn' | 'ok';
}) {
  return (
    <section class={`card ${props.tone ?? ''}`}>
      {(props.title || props.actions) && (
        <header class="card-header">
          {props.title && <h2>{props.title}</h2>}
          {props.actions && <div class="card-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Badge(props: { tone: 'ok' | 'warn' | 'bad' | 'neutral'; children: ComponentChildren }) {
  return <span class={`badge ${props.tone}`}>{props.children}</span>;
}

export function Field(props: { label: string; hint?: ComponentChildren; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </label>
  );
}

/** Read-only value with a copy button, used for the exact values the Google console needs. */
export function CopyField(props: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value);
    } catch {
      const input = document.createElement('textarea');
      input.value = props.value;
      document.body.append(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div class="copy-field">
      <span class="field-label">{props.label}</span>
      <div class="copy-row">
        <code>{props.value}</code>
        <button type="button" class="btn small" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </div>
  );
}

export function Notice(props: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ComponentChildren }) {
  return <div class={`notice ${props.tone}`}>{props.children}</div>;
}

/** Wraps async button handlers with a busy state and an error message. */
export function useAction(): {
  busy: boolean;
  error: string | null;
  message: string | null;
  run: (fn: () => Promise<string | void>) => Promise<void>;
  clear: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (result) setMessage(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, run, clear: () => (setError(null), setMessage(null)) };
}

export function ActionFeedback(props: { error: string | null; message: string | null }) {
  return (
    <>
      {props.error && <Notice tone="bad">{props.error}</Notice>}
      {props.message && <Notice tone="ok">{props.message}</Notice>}
    </>
  );
}
