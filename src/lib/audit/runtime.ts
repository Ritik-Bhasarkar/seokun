import "server-only";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { runCheerioChecks } from "./cheerio-checks";
import {
	type Lhr,
	mapLhrToFindings,
	mapLhrToScores,
} from "./lighthouse-mapper";
import type { Finding, Scores } from "./schema";

// Lighthouse exports default in ESM. If your runtime can't resolve the default
// export, fall back to: import lighthouse from "lighthouse/core/index.cjs";
import lighthouse from "lighthouse";

export type RuntimeResult = {
	scores: Scores;
	findings: Finding[];
	html: string;
};

export async function runRuntime(url: string): Promise<RuntimeResult> {
	const browser = await chromium.launch({
		args: ["--remote-debugging-port=9222"],
		headless: true,
	});

	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
		const html = await page.content();

		const lhr = await runLighthouse(url);
		const runtimeFindings = lhr ? mapLhrToFindings(lhr) : [];
		const scores: Scores = lhr
			? mapLhrToScores(lhr)
			: { seo: 0, performance: 0, accessibility: 0 };

		const $ = cheerio.load(html);
		const cheerioFindings = runCheerioChecks($);

		return {
			scores,
			findings: [...runtimeFindings, ...cheerioFindings],
			html,
		};
	} finally {
		await browser.close();
	}
}

async function runLighthouse(url: string): Promise<Lhr | null> {
	try {
		const result = await lighthouse(url, {
			port: 9222,
			output: "json",
			logLevel: "error",
			onlyCategories: ["seo", "performance", "accessibility"],
		});
		if (!result?.lhr) return null;
		return result.lhr as unknown as Lhr;
	} catch (err) {
		console.error("[audit] lighthouse failed", err);
		return null;
	}
}
