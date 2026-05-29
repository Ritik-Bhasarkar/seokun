import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

export function checkNextImageAlt(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	// First pass: walk ImportDeclarations to find the local binding for next/image's default export
	let nextImageLocalName: string | null = null;
	for (const node of ast.program.body) {
		if (node.type !== "ImportDeclaration") continue;
		if (node.source.value !== "next/image") continue;
		for (const spec of node.specifiers) {
			if (spec.type === "ImportDefaultSpecifier") {
				nextImageLocalName = spec.local.name;
			}
		}
	}

	if (!nextImageLocalName) return [];

	const out: Finding[] = [];
	let idx = 0;

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier") return;
			if (name.name !== nextImageLocalName) return;

			const hasAlt = path.node.attributes.some((attr) => {
				if (attr.type !== "JSXAttribute") return false;
				if (attr.name.type !== "JSXIdentifier") return false;
				if (attr.name.name !== "alt") return false;
				const v = attr.value;
				if (!v) return false;
				if (v.type === "StringLiteral") return v.value.trim().length > 0;
				return true;
			});

			if (hasAlt) return;
			const line = path.node.loc?.start.line ?? 0;
			out.push({
				id: `source.next-image-alt.${filePath}:${line}.${idx++}`,
				severity: "warning",
				category: "a11y",
				title: "next/image <Image> missing alt prop",
				element: `${filePath}:${line}`,
				recommendation:
					"`alt` is required on next/image's <Image>. Use `alt=\"\"` for decorative images.",
				fixHint: 'alt="Brief description of the image"',
			});
		},
	});

	return out;
}
