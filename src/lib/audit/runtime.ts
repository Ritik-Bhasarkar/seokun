import "server-only";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { runCheerioChecks } from "./cheerio-checks";
import { classifyNetworkError, UnreachableError } from "./errors";
import {
	type Lhr,
	mapLhrToFindings,
	mapLhrToMetrics,
	mapLhrToScores,
} from "./lighthouse-mapper";
import type { Finding, FormFactor, Metric, Scores } from "./schema";

// Lighthouse exports default in ESM. If your runtime can't resolve the default
// export, fall back to: import lighthouse from "lighthouse/core/index.cjs";
import lighthouse from "lighthouse";

const PREFLIGHT_TIMEOUT_MS = 6000;
const GOTO_TIMEOUT_MS = 45_000;

async function preflight(url: string): Promise<void> {
	const host = new URL(url).host;
	try {
		const res = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
		});
		// Any HTTP response — including 4xx/5xx — proves the host resolves and
		// listens. Let the audit proceed; the report will reflect a bad page.
		if (res.status === 405 || res.status === 501) {
			// Server rejected HEAD; try a tiny GET to confirm reachability.
			await fetch(url, {
				method: "GET",
				redirect: "follow",
				headers: { Range: "bytes=0-0" },
				signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
			});
		}
	} catch (err) {
		const reason = classifyNetworkError(err) ?? "network";
		throw new UnreachableError(host, reason);
	}
}

export type RuntimeResult = {
	scores: Scores;
	metrics: Metric[];
	findings: Finding[];
	html: string;
};

export async function runRuntime(
	url: string,
	formFactor: FormFactor = "mobile",
): Promise<RuntimeResult> {
	// Fail fast on bad domains before spinning chromium up.
	await preflight(url);

	const browser = await chromium.launch({
		args: ["--remote-debugging-port=9222"],
		headless: true,
	});

	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await page.goto(url, {
				waitUntil: "networkidle",
				timeout: GOTO_TIMEOUT_MS,
			});
		} catch (err) {
			const reason = classifyNetworkError(err);
			if (reason) {
				throw new UnreachableError(new URL(url).host, reason);
			}
			throw err;
		}
		const html = await page.content();

		const lhr = await runLighthouse(url, formFactor);
		const findings = lhr ? mapLhrToFindings(lhr) : [];
		const metrics = lhr ? mapLhrToMetrics(lhr) : [];
		const scores: Scores = lhr
			? mapLhrToScores(lhr)
			: { seo: 0, performance: 0, accessibility: 0, bestPractices: 0 };

		const $ = cheerio.load(html);
		const cheerioFindings = runCheerioChecks($);

		return {
			scores,
			metrics,
			findings: [...findings, ...cheerioFindings],
			html,
		};
	} finally {
		await browser.close();
	}
}

async function runLighthouse(
	url: string,
	formFactor: FormFactor,
): Promise<Lhr | null> {
	try {
		const result = await lighthouse(url, {
			port: 9222,
			output: "json",
			logLevel: "error",
			onlyCategories: ["seo", "performance", "accessibility", "best-practices"],
			formFactor,
			screenEmulation:
				formFactor === "mobile"
					? {
							mobile: true,
							width: 412,
							height: 823,
							deviceScaleFactor: 1.75,
							disabled: false,
						}
					: {
							mobile: false,
							width: 1350,
							height: 940,
							deviceScaleFactor: 1,
							disabled: false,
						},
		});
		if (!result?.lhr) return null;
		return result.lhr as unknown as Lhr;
	} catch (err) {
		console.error("[audit] lighthouse failed", err);
		return null;
	}
}
