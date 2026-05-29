import type { CheerioAPI } from "cheerio";
import type { Finding } from "./schema";

type Check = ($: CheerioAPI) => Finding[];

const missingAltImages: Check = ($) => {
	const out: Finding[] = [];
	let idx = 0;
	$("img").each((_, el) => {
		const alt = $(el).attr("alt");
		if (alt === undefined || alt.trim() === "") {
			const src = $(el).attr("src") ?? "";
			out.push({
				id: `cheerio.img-alt.${idx++}`,
				severity: "warning",
				category: "a11y",
				title: "Image is missing alt text",
				element: src ? `<img src="${src.slice(0, 80)}">` : "<img>",
				recommendation:
					"Add a descriptive `alt` attribute. Use `alt=\"\"` only when the image is purely decorative.",
				fixHint: 'alt="Brief description of the image"',
			});
		}
	});
	return out;
};

const missingMetaDescription: Check = ($) => {
	const tag = $('meta[name="description"]').first();
	const content = tag.attr("content")?.trim();
	if (tag.length === 0 || !content) {
		return [
			{
				id: "cheerio.meta-description",
				severity: "warning",
				category: "seo",
				title: "Missing <meta name=\"description\">",
				recommendation:
					"Add a meta description (~150-160 chars) summarising the page. Search engines use it as the snippet under your title.",
				fixHint:
					'<meta name="description" content="One-sentence summary of this page.">',
			},
		];
	}
	return [];
};

const ogTagChecks: Check = ($) => {
	const required: Array<{ name: string; recommendation: string }> = [
		{
			name: "og:title",
			recommendation:
				"Add an Open Graph title so links shared to social platforms render with a proper headline.",
		},
		{
			name: "og:description",
			recommendation: "Add an Open Graph description for shared-link previews.",
		},
		{
			name: "og:image",
			recommendation:
				"Add an Open Graph image (1200x630 ideal) so shared links show a preview thumbnail.",
		},
	];
	const out: Finding[] = [];
	for (const { name, recommendation } of required) {
		const tag = $(`meta[property="${name}"]`).first();
		const content = tag.attr("content")?.trim();
		if (tag.length === 0 || !content) {
			out.push({
				id: `cheerio.${name.replace(":", "-")}`,
				severity: "info",
				category: "seo",
				title: `Missing <meta property="${name}">`,
				recommendation,
				fixHint: `<meta property="${name}" content="...">`,
			});
		}
	}
	return out;
};

const titleCheck: Check = ($) => {
	const text = $("title").first().text().trim();
	if (!text) {
		return [
			{
				id: "cheerio.title",
				severity: "critical",
				category: "seo",
				title: "Page is missing a <title>",
				recommendation:
					"Every page needs a unique, descriptive <title>. It's the primary signal in search results and browser tabs.",
				fixHint: "<title>Page name · Site name</title>",
			},
		];
	}
	return [];
};

const checks: Check[] = [
	missingAltImages,
	missingMetaDescription,
	ogTagChecks,
	titleCheck,
];

export function runCheerioChecks($: CheerioAPI): Finding[] {
	const findings: Finding[] = [];
	for (const check of checks) {
		try {
			findings.push(...check($));
		} catch (err) {
			console.error("[audit] cheerio check failed", err);
		}
	}
	return findings;
}
