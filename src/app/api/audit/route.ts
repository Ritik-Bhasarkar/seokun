import { ZodError } from "zod";
import { audit } from "@/lib/audit";
import { AuditInputSchema } from "@/lib/audit/schema";
import { getSession } from "@/lib/session";

export const maxDuration = 90;

export async function POST(request: Request) {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}

	let input;
	try {
		input = AuditInputSchema.parse(raw);
	} catch (err) {
		if (err instanceof ZodError) {
			return Response.json(
				{ error: "validation_error", issues: err.issues },
				{ status: 400 },
			);
		}
		return Response.json({ error: "validation_error" }, { status: 400 });
	}

	// Auth only required when a repo is involved — source checks need a token
	let githubToken: string | undefined;
	if (input.repo) {
		const session = await getSession();
		if (!session) {
			return Response.json(
				{ error: "session_required_for_source_checks" },
				{ status: 401 },
			);
		}
		githubToken = session.githubToken;
	}

	try {
		const report = await audit({
			url: input.url,
			repo: input.repo,
			formFactor: input.formFactor,
			githubToken,
		});
		return Response.json(report);
	} catch (err) {
		console.error("[audit] engine failed", err);
		return Response.json({ error: "audit_failed" }, { status: 500 });
	}
}
