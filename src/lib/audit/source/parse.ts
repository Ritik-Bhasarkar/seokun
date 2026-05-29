import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { File } from "@babel/types";

// Handle CJS/ESM default-export quirk for @babel/traverse
type TraverseFn = typeof import("@babel/traverse").default;
export const traverse: TraverseFn =
	((_traverse as unknown as { default?: TraverseFn }).default ??
		(_traverse as unknown as TraverseFn));

export function parseSource(code: string): File | null {
	try {
		return parse(code, {
			sourceType: "module",
			plugins: ["jsx", "typescript"],
			errorRecovery: true,
		});
	} catch (err) {
		console.error("[audit] babel parse failed", err);
		return null;
	}
}
