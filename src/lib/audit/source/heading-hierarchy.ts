import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

// Flags pages that have a heading hierarchy that skips levels (e.g. <h1>
// directly followed by <h3>) or that have multiple <h1>s. Walks JSX in source
// order — order in the AST corresponds to render order closely enough for a
// static check.
export function checkHeadingHierarchy(
	filePath: string,
	code: string,
): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const headings: Array<{ level: number; line: number }> = [];

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier") return;
			const m = /^h([1-6])$/.exec(name.name);
			if (!m) return;
			headings.push({
				level: Number(m[1]),
				line: path.node.loc?.start.line ?? 0,
			});
		},
	});

	if (headings.length === 0) return [];

	const out: Finding[] = [];
	let idx = 0;
	let h1Count = 0;

	for (let i = 0; i < headings.length; i++) {
		const h = headings[i];
		if (h.level === 1) h1Count += 1;
		if (i > 0) {
			const prev = headings[i - 1];
			if (h.level > prev.level + 1) {
				out.push({
					id: `source.heading-hierarchy.${filePath}:${h.line}.${idx++}`,
					severity: "warning",
					category: "seo",
					title: `Heading skips level (<h${prev.level}> → <h${h.level}>)`,
					element: `${filePath}:${h.line}`,
					recommendation:
						"Heading levels should be sequential. Skipping levels breaks screen-reader navigation and weakens SEO structure.",
					fixHint: `Use <h${prev.level + 1}> instead of <h${h.level}>`,
				});
			}
		}
	}

	if (h1Count > 1) {
		const second = headings.find((h) => h.level === 1);
		out.push({
			id: `source.heading-hierarchy.multiple-h1.${filePath}`,
			severity: "warning",
			category: "seo",
			title: `Multiple <h1> elements (${h1Count})`,
			element: `${filePath}:${second?.line ?? 1}`,
			recommendation:
				"A page should have one primary <h1>. Multiple <h1> elements confuse search engines and assistive tech about the page's main topic.",
			fixHint: "Promote one h1; demote others to h2 or h3",
		});
	}

	return out;
}
