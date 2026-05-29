import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

export function checkEmptyLink(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	traverse(ast, {
		JSXElement(path) {
			const opening = path.node.openingElement;
			const name = opening.name;
			if (name.type !== "JSXIdentifier" || name.name !== "a") return;

			let hasValidHref = false;
			let hrefValue: string | null = null;
			let hrefMissing = true;
			for (const attr of opening.attributes) {
				if (attr.type !== "JSXAttribute") continue;
				if (attr.name.type !== "JSXIdentifier") continue;
				if (attr.name.name !== "href") continue;
				hrefMissing = false;
				const v = attr.value;
				if (!v) break;
				if (v.type === "StringLiteral") {
					hrefValue = v.value;
					const trimmed = v.value.trim();
					if (trimmed && trimmed !== "#") hasValidHref = true;
				} else {
					// JSXExpressionContainer — trust the dev
					hasValidHref = true;
				}
				break;
			}

			const hasChildren = path.node.children.some((c) => {
				if (c.type === "JSXText") return c.value.trim().length > 0;
				if (c.type === "JSXElement" || c.type === "JSXFragment") return true;
				if (c.type === "JSXExpressionContainer") return true;
				return false;
			});

			const line = opening.loc?.start.line ?? 0;

			if (hrefMissing || !hasValidHref) {
				const reason = hrefMissing
					? "missing href"
					: `href="${hrefValue ?? ""}"`;
				out.push({
					id: `source.empty-link.href.${filePath}:${line}.${idx++}`,
					severity: "warning",
					category: "seo",
					title: `<a> has invalid href (${reason})`,
					element: `${filePath}:${line}`,
					recommendation:
						"Use a real URL or path. For purely interactive controls without navigation, use a <button> instead.",
					fixHint: 'href="/some-path"',
				});
			}

			if (!hasChildren) {
				out.push({
					id: `source.empty-link.empty.${filePath}:${line}.${idx++}`,
					severity: "warning",
					category: "a11y",
					title: "<a> has no children — link text is empty",
					element: `${filePath}:${line}`,
					recommendation:
						"Add link text or an aria-label so screen readers can announce the link.",
					fixHint: "Visible link text or aria-label=\"...\"",
				});
			}
		},
	});

	return out;
}
