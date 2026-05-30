import "server-only";

const tokens = new Map<string, string>();

export function setGithubToken(uid: string, token: string): void {
  tokens.set(uid, token);
}

export function getGithubToken(uid: string): string | undefined {
  return tokens.get(uid);
}

export function clearGithubToken(uid: string): void {
  tokens.delete(uid);
}

export function _resetForTests(): void {
  tokens.clear();
}
