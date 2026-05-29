import "server-only";
import { z } from "zod";

const Schema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  MCP_TOKEN_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof Schema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  return Schema.parse(input);
}

let _env: Env | undefined;
function loadEnv(): Env {
  if (!_env) {
    _env = parseEnv(process.env as Record<string, string | undefined>);
  }
  return _env;
}

// Lazy: validation only runs on first property access, so `parseEnv` can be
// imported standalone in tests without needing process.env populated.
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return loadEnv()[prop as keyof Env];
  },
});
