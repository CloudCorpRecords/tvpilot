/**
 * tvpilot types.
 *
 * Shapes follow the public TVWizard tool reference: a paired Android
 * TV is controlled through a hosted relay, one bearer token maps to
 * the caller's own TV, and tools never accept a device id. HTTP
 * access is described by a minimal response surface so tests can
 * inject a fake fetch and never touch the network.
 */

export const TV_KEYS = [
  "POWER",
  "HOME",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "OK",
  "BACK",
  "VOL_UP",
  "VOL_DOWN",
] as const;

export type TvKey = (typeof TV_KEYS)[number];

export const PROVIDERS = [
  "netflix",
  "disney_plus",
  "prime_video",
  "max",
  "hulu",
  "apple_tv_plus",
  "paramount_plus",
  "peacock",
  "fubo_tv",
  "youtube",
  "stremio",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface RelayOptions {
  relayUrl?: string;
  token?: string;
}

export interface SendKeyOptions extends RelayOptions {
  key: string;
}

export interface LaunchAppOptions extends RelayOptions {
  data: string;
  package?: string;
}

export interface PlayTitleOptions extends RelayOptions {
  title: string;
  country?: string;
  season?: number;
  episode?: number;
  year?: number;
  provider?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
