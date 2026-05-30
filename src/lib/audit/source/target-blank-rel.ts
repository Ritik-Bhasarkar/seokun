import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

// Flags <a target="_blank"> without rel="noopener" (or noreferrer).
// Without rel=noopener the new tab gets access to window.opener, which is
// a tabnabbing vector and slows the new tab down.
export function checkTargetBlankRel(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier" || name.name !== "a") return;

			let isBlank = false;
			let relValue: string | null = null;
			let hasDynamicRel = false;
			for (const attr of path.node.attributes) {
				if (attr.type !== "JSXAttribute") continue;
				if (attr.name.type !== "JSXIdentifier") continue;
				const an = attr.name.name;
				const v = attr.value;
				if (an === "target" && v?.type === "StringLiteral" && v.value === "_blank") {
					isBlank = true;
				}
				if (an === "rel") {
					if (v?.type === "StringLiteral") relValue = v.value;
					else hasDynamicRel = true;
				}
			}
			if (!isBlank) return;
			if (hasDynamicRel) return; // expression rel — trust the dev

			const safe = relValue
				? /noopener|noreferrer/.test(relValue)
				: false;
			if (safe) return;

			const line = path.node.loc?.start.line ?? 0;
			out.push({
				id: `source.target-blank-rel.${filePath}:${line}.${idx++}`,
				severity: "warning",
				category: "best-practices",
				title: '<a target="_blank"> missing rel="noopener noreferrer"',
				element: `${filePath}:${line}`,
				recommendation:
					"Links that open in a new tab should use rel=\"noopener noreferrer\" to prevent the new page from accessing window.opener (tabnabbing).",
				fixHint: 'target="_blank" rel="noopener noreferrer"',
			});
		},
	});

	return out;
}
