import type { Finding } from "../schema";
import { parseSource, traverse } from "./parse";

export function checkMissingMetadata(filePath: string, code: string): Finding[] {
	// Only applies to Next.js layout.tsx / layout.jsx files
	const base = filePath.split("/").pop() ?? "";
	if (base !== "layout.tsx" && base !== "layout.jsx") return [];

	const ast = parseSource(code);
	if (!ast) return [];

	let hasMetadataExport = false;

	traverse(ast, {
		ExportNamedDeclaration(path) {
			const decl = path.node.declaration;
			if (decl?.type !== "VariableDeclaration") return;
			for (const declarator of decl.declarations) {
				if (
					declarator.id.type === "Identifier" &&
					declarator.id.name === "metadata"
				) {
					hasMetadataExport = true;
				}
			}
		},
	});

	if (hasMetadataExport) return [];

	return [
		{
			id: `source.missing-metadata.${filePath}`,
			severity: "warning",
			category: "seo",
			title: "Next.js layout missing `export const metadata`",
			element: `${filePath}:1`,
			recommendation:
				"Export a `metadata` constant from your layout so Next.js generates <title> and meta tags. See https://nextjs.org/docs/app/api-reference/functions/generate-metadata",
			fixHint:
				'export const metadata = { title: "...", description: "..." };',
		},
	];
}
