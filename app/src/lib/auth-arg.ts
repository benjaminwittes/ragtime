import type { Provider } from '@/llm/byok-context'

/**
 * Discriminated union of auth modes accepted by the Worker's billed
 * endpoints (/corpus/{sql,read-batch,analyze,plan,execute}). The
 * worker-client functions take this in place of `ByokConfig` so callers
 * can flip between BYOK and paid without a different call site.
 *
 * BYOK: provider + model + api key, all carried in the request body
 *   (the Worker's resolveCorpusAuth picks up `user_api_key`).
 * Paid: model only (provider is always anthropic on the paid path) +
 *   a Supabase session JWT carried in the `Authorization: Bearer` header.
 *   The Worker debits the account on success.
 * Demo: model + shared demo password in the body (Anthropic only; the
 *   Worker's resolveCorpusAuth picks up `password` and bills Lawfare's key
 *   against a shared daily quota). TEMPORARY pre-launch demo path — see
 *   src/lib/demo-access.ts.
 */
export type AuthArg =
  | { mode: 'byok'; provider: Provider; model: string; apiKey: string }
  | { mode: 'paid'; model: string; sessionToken: string }
  | { mode: 'demo'; model: string; password: string }

/** Build the auth-related request body fields. The endpoint-specific body
 *  spreads this in alongside its own fields (prompt, scope, etc.). */
export function authBody(auth: AuthArg): Record<string, unknown> {
  if (auth.mode === 'byok') {
    return {
      provider: auth.provider,
      model: auth.model,
      user_api_key: auth.apiKey,
    }
  }
  if (auth.mode === 'demo') {
    // Demo is Anthropic-only per Worker enforcement.
    return {
      provider: 'anthropic',
      model: auth.model,
      password: auth.password,
    }
  }
  // Paid: provider is always anthropic per Worker enforcement.
  return {
    provider: 'anthropic',
    model: auth.model,
  }
}

/** Credential-only body fields for the second (execute) leg of a two-call
 *  AMA flow, where provider/model were already fixed by the plan token and
 *  only the credential needs re-sending. Paid carries its JWT in the header,
 *  so it contributes nothing here. */
export function authCredentialBody(auth: AuthArg): Record<string, unknown> {
  if (auth.mode === 'byok') return { user_api_key: auth.apiKey }
  if (auth.mode === 'demo') return { password: auth.password }
  return {}
}

/** Build the request headers for a billed call. Paid mode adds the Bearer
 *  token; BYOK relies on body-level credentials and only needs the
 *  content-type. */
export function authHeaders(auth: AuthArg): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (auth.mode === 'paid') {
    h['Authorization'] = `Bearer ${auth.sessionToken}`
  }
  return h
}
