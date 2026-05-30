import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

// Flags <div> / <span> elements with an onClick handler and no role="button"
// or tabIndex. Keyboard users and screen readers can't reach or activate these.
export function checkDivAsButton(filePath: string, code: string): Finding[] {
	const ast = parseSource(code);
	if (!ast) return [];

	const out: Finding[] = [];
	let idx = 0;

	const interactiveContainers = new Set(["div", "span", "section", "article"]);

	traverse(ast, {
		JSXOpeningElement(path) {
			const name = path.node.name;
			if (name.type !== "JSXIdentifier") return;
			if (!interactiveContainers.has(name.name)) return;

			let hasOnClick = false;
			let role: string | null = null;
			let hasTabIndex = false;
			for (const attr of path.node.attributes) {
				if (attr.type !== "JSXAttribute") continue;
				if (attr.name.type !== "JSXIdentifier") continue;
				const an = attr.name.name;
				if (an === "onClick") hasOnClick = true;
				if (an === "role" && attr.value?.type === "StringLiteral") {
					role = attr.value.value;
				}
				if (an === "tabIndex") hasTabIndex = true;
				// Treat as presentational; assume the dev knows what they're doing
				if (an === "aria-hidden") hasTabIndex = true;
			}

			if (!hasOnClick) return;
			if (role === "button" || role === "link" || role === "tab") return;
			if (hasTabIndex && role) return;

			const line = path.node.loc?.start.line ?? 0;
			out.push({
				id: `source.div-as-button.${filePath}:${line}.${idx++}`,
				severity: "warning",
				category: "a11y",
				title: `<${name.name} onClick> is not keyboard-accessible`,
				element: `${filePath}:${line}`,
				recommendation:
					"Use a real <button> instead of a clickable div/span. Buttons are focusable, activatable by Enter/Space, and announced as buttons by screen readers.",
				fixHint: "<button type=\"button\" onClick={…}>",
			});
		},
	});

	return out;
}
