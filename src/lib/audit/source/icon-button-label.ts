import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

// Flags <button> elements whose only children are SVG / icon components and
// which lack aria-label / aria-labelledby / title. Screen readers see no
// accessible name and announce only "button."
export function checkIconButtonLabel(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	traverse(ast, {
		JSXElement(path) {
			const opening = path.node.openingElement;
			const name = opening.name;
			if (name.type !== "JSXIdentifier" || name.name !== "button") return;

			const hasAccessibleName = opening.attributes.some((attr) => {
				if (attr.type !== "JSXAttribute") return false;
				if (attr.name.type !== "JSXIdentifier") return false;
				const n = attr.name.name;
				if (n !== "aria-label" && n !== "aria-labelledby" && n !== "title") {
					return false;
				}
				const v = attr.value;
				if (!v) return false;
				if (v.type === "StringLiteral") return v.value.trim().length > 0;
				return true;
			});
			if (hasAccessibleName) return;

			let hasText = false;
			let hasIconish = false;
			for (const child of path.node.children) {
				if (child.type === "JSXText" && child.value.trim().length > 0) {
					hasText = true;
				}
				if (child.type === "JSXElement") {
					const inner = child.openingElement.name;
					if (inner.type === "JSXIdentifier") {
						const innerName = inner.name;
						if (innerName === "svg" || /^Icon[A-Z]/.test(innerName)) {
							hasIconish = true;
						}
					}
				}
				if (child.type === "JSXExpressionContainer") {
					// Expression children may render visible text; assume yes
					hasText = true;
				}
			}

			if (!hasText && hasIconish) {
				const line = opening.loc?.start.line ?? 0;
				out.push({
					id: `source.icon-button-label.${filePath}:${line}.${idx++}`,
					severity: "warning",
					category: "a11y",
					title: "Icon-only <button> has no accessible name",
					element: `${filePath}:${line}`,
					recommendation:
						"Buttons with only an icon need an aria-label, aria-labelledby, or title so screen readers can announce them.",
					fixHint: 'aria-label="Close" (or whatever the button does)',
				});
			}
		},
	});

	return out;
}
