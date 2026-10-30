import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface OidcIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Abstraction over the identity provider so tests can substitute a fake. */
export interface OidcProvider {
  discovery(): Promise<OidcDiscovery>;
  exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ idToken: string }>;
  verifyIdToken(idToken: string, clientId: string, nonce: string): Promise<OidcIdentity>;
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/** Google OpenID Connect: authorization code flow with PKCE, ID token verified against Google's JWKS. */
export class GoogleOidc implements OidcProvider {
  private cached: { value: OidcDiscovery; at: number } | null = null;
  private jwks: { uri: string; set: JWTVerifyGetKey } | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async discovery(): Promise<OidcDiscovery> {
    if (this.cached && Date.now() - this.cached.at < 3600_000) return this.cached.value;
    const response = await this.fetchImpl(GOOGLE_DISCOVERY_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Discovery failed with HTTP ${response.status}`);
    const json = (await response.json()) as Record<string, unknown>;
    const value: OidcDiscovery = {
      issuer: String(json.issuer),
      authorizationEndpoint: String(json.authorization_endpoint),
      tokenEndpoint: String(json.token_endpoint),
      jwksUri: String(json.jwks_uri),
    };
    this.cached = { value, at: Date.now() };
    return value;
  }

  async exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ idToken: string }> {
    const { tokenEndpoint } = await this.discovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });
    const response = await this.fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof json.id_token !== 'string') {
      const reason = typeof json.error === 'string' ? json.error : `HTTP ${response.status}`;
      throw new Error(`Token exchange failed: ${reason}`);
    }
    return { idToken: json.id_token };
  }

  async verifyIdToken(idToken: string, clientId: string, nonce: string): Promise<OidcIdentity> {
    const { jwksUri } = await this.discovery();
    if (!this.jwks || this.jwks.uri !== jwksUri) {
      this.jwks = { uri: jwksUri, set: createRemoteJWKSet(new URL(jwksUri)) };
    }
    const { payload } = await jwtVerify(idToken, this.jwks.set, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    });
    if (payload.nonce !== nonce) throw new Error('Nonce mismatch');
    if (typeof payload.sub !== 'string') throw new Error('Missing subject');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : null,
      picture:
        typeof payload.picture === 'string' && payload.picture.startsWith('https://')
          ? payload.picture
          : null,
    };
  }
}
