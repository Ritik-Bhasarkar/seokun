import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

// Flags <input>, <select>, <textarea> elements that don't have an
// `id` connected to a <label htmlFor>, an aria-label, or an aria-labelledby.
// First pass: collect all `htmlFor` values seen in the file.
// Second pass: flag form controls whose id isn't in that set and which lack
// any aria-label / aria-labelledby attribute.
export function checkInputWithoutLabel(
	filePath: string,
	code: string,
): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const htmlForIds = new Set<string>();

	traverse(ast, {
		JSXAttribute(path) {
			if (path.node.name.type !== "JSXIdentifier") return;
			const n = path.node.name.name;
			if (n !== "htmlFor" && n !== "for") return;
			const v = path.node.value;
			if (v?.type === "StringLiteral") htmlForIds.add(v.value);
		},
	});

	const out: Finding[] = [];
	let idx = 0;

	const formControls = new Set(["input", "select", "textarea"]);

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier") return;
			if (!formControls.has(name.name)) return;

			// Skip hidden inputs and submit buttons — they don't need labels
			let type: string | null = null;
			let id: string | null = null;
			let hasAriaLabel = false;
			for (const attr of path.node.attributes) {
				if (attr.type !== "JSXAttribute") continue;
				if (attr.name.type !== "JSXIdentifier") continue;
				const an = attr.name.name;
				const v = attr.value;
				if (an === "type" && v?.type === "StringLiteral") type = v.value;
				if (an === "id" && v?.type === "StringLiteral") id = v.value;
				if (
					(an === "aria-label" || an === "aria-labelledby") &&
					v &&
					(v.type !== "StringLiteral" || v.value.trim().length > 0)
				) {
					hasAriaLabel = true;
				}
			}
			if (type === "hidden" || type === "submit" || type === "button") return;
			if (hasAriaLabel) return;
			if (id && htmlForIds.has(id)) return;

			const line = path.node.loc?.start.line ?? 0;
			out.push({
				id: `source.input-without-label.${filePath}:${line}.${idx++}`,
				severity: "warning",
				category: "a11y",
				title: `<${name.name}> has no associated label`,
				element: `${filePath}:${line}`,
				recommendation:
					"Form controls need an accessible label. Wrap in <label>, add an id matching a <label htmlFor>, or set aria-label.",
				fixHint: '<label htmlFor="email">Email</label><input id="email" .../>',
			});
		},
	});

	return out;
}
