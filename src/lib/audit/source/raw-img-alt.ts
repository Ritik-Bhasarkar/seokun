import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

export function checkRawImgAlt(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier" || name.name !== "img") return;

			const hasAlt = path.node.attributes.some((attr) => {
				if (attr.type !== "JSXAttribute") return false;
				if (attr.name.type !== "JSXIdentifier") return false;
				if (attr.name.name !== "alt") return false;
				const v = attr.value;
				if (!v) return false;
				if (v.type === "StringLiteral") return v.value.trim().length > 0;
				// JSXExpressionContainer — assume non-empty intent
				return true;
			});

			if (hasAlt) return;
			const line = path.node.loc?.start.line ?? 0;
			out.push({
				id: `source.raw-img-alt.${filePath}:${line}.${idx++}`,
				severity: "warning",
				category: "a11y",
				title: "<img> tag missing alt attribute",
				element: `${filePath}:${line}`,
				recommendation:
					"Add an `alt` attribute. Use `alt=\"\"` for purely decorative images.",
				fixHint: 'alt="Brief description of the image"',
			});
		},
	});

	return out;
}
