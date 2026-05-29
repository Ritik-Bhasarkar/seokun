export class UnreachableError extends Error {
	readonly code = "unreachable" as const;
	readonly host: string;
	readonly reason: "dns" | "refused" | "timeout" | "network";

	constructor(host: string, reason: UnreachableError["reason"], message?: string) {
		super(message ?? `Couldn't reach ${host}`);
		this.name = "UnreachableError";
		this.host = host;
		this.reason = reason;
	}
}

const DNS_PATTERNS = [
	/ENOTFOUND/,
	/ERR_NAME_NOT_RESOLVED/,
	/getaddrinfo/i,
];

const REFUSED_PATTERNS = [
	/ECONNREFUSED/,
	/ERR_CONNECTION_REFUSED/,
];

const TIMEOUT_PATTERNS = [
	/ETIMEDOUT/,
	/ERR_TIMED_OUT/,
	/timed? out/i,
	/AbortError/,
];

export function classifyNetworkError(err: unknown): UnreachableError["reason"] | null {
	const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
	if (DNS_PATTERNS.some((p) => p.test(msg))) return "dns";
	if (REFUSED_PATTERNS.some((p) => p.test(msg))) return "refused";
	if (TIMEOUT_PATTERNS.some((p) => p.test(msg))) return "timeout";
	return null;
}
