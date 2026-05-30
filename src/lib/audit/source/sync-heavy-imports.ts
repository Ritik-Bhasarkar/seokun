import type { Finding } from "../schema";
import { parseSource } from "./parse";

// Flags top-level static `import` of libraries known to be large enough
// that they should be loaded dynamically. These are deps that often bloat
// the initial JS bundle when bundlers can't tree-shake them.
const HEAVY = new Set<string>([
	"moment",
	"lodash",
	"jquery",
	"chart.js",
	"d3",
	"three",
	"@tensorflow/tfjs",
	"monaco-editor",
	"@codemirror/state",
	"@codemirror/view",
	"recharts",
	"video.js",
	"pdfjs-dist",
]);

export function checkSyncHeavyImports(
	filePath: string,
	code: string,
): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	for (const node of ast.program.body) {
		if (node.type !== "ImportDeclaration") continue;
		const src = node.source.value;
		// Match exact dep name or scoped path prefix
		const top = src.startsWith("@")
			? src.split("/").slice(0, 2).join("/")
			: src.split("/")[0];
		if (!HEAVY.has(top)) continue;

		const line = node.loc?.start.line ?? 0;
		out.push({
			id: `source.sync-heavy-imports.${filePath}:${line}.${idx++}`,
			severity: "warning",
			category: "perf",
			title: `Static import of heavy dep "${top}" inflates initial bundle`,
			element: `${filePath}:${line}`,
			recommendation: `\`${top}\` is large. Load it dynamically with import("${src}") inside the code path that needs it, or use a lighter alternative if one exists.`,
			fixHint: `const ${top.replace(/[-@/]/g, "_")} = (await import("${src}")).default;`,
		});
	}

	return out;
}
