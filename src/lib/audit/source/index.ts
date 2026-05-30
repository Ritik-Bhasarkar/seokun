import "server-only";
import { Octokit } from "@octokit/rest";
import type { Finding } from "../schema";
import { checkDivAsButton } from "./div-as-button";
import { checkEmptyLink } from "./empty-link";
import { checkHeadingHierarchy } from "./heading-hierarchy";
import { checkIconButtonLabel } from "./icon-button-label";
import { checkInputWithoutLabel } from "./input-without-label";
import { checkMissingMetadata } from "./missing-metadata";
import { checkNextImageAlt } from "./next-image-alt";
import { checkRawImgAlt } from "./raw-img-alt";
import { checkSyncHeavyImports } from "./sync-heavy-imports";
import { checkTargetBlankRel } from "./target-blank-rel";

const MAX_FILES = 30;
const EXCLUDE = ["node_modules/", "dist/", ".next/", "build/", ".turbo/"];

type SourceFile = { path: string; code: string };

async function fetchSourceFiles(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<SourceFile[]> {
	const repoMeta = await octokit.repos.get({ owner, repo });
	const ref = repoMeta.data.default_branch;

	const branch = await octokit.repos.getBranch({ owner, repo, branch: ref });
	const treeSha = branch.data.commit.commit.tree.sha;

	const tree = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: treeSha,
		recursive: "true",
	});

	const candidates = (tree.data.tree ?? [])
		.filter((e) => e.type === "blob" && typeof e.path === "string")
		.filter((e) => {
			const p = e.path as string;
			if (!p.endsWith(".tsx") && !p.endsWith(".jsx")) return false;
			return !EXCLUDE.some((prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`));
		})
		.slice(0, MAX_FILES);

	const files: SourceFile[] = [];
	for (const entry of candidates) {
		const path = entry.path as string;
		try {
			const res = await octokit.repos.getContent({ owner, repo, path, ref });
			const data = res.data;
			if (Array.isArray(data) || data.type !== "file" || !("content" in data)) continue;
			const code = Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
			files.push({ path, code });
		} catch (err) {
			console.error(`[audit] failed to fetch ${path}`, err);
		}
	}
	return files;
}

const SOURCE_CHECKS: Array<(filePath: string, code: string) => Finding[]> = [
	checkRawImgAlt,
	checkMissingMetadata,
	checkEmptyLink,
	checkNextImageAlt,
	checkIconButtonLabel,
	checkInputWithoutLabel,
	checkDivAsButton,
	checkTargetBlankRel,
	checkHeadingHierarchy,
	checkSyncHeavyImports,
];

export async function runSourceChecks(input: {
	githubToken: string;
	owner: string;
	repo: string;
}): Promise<Finding[]> {
	const octokit = new Octokit({ auth: input.githubToken });
	let files: SourceFile[];
	try {
		files = await fetchSourceFiles(octokit, input.owner, input.repo);
	} catch (err) {
		console.error("[audit] failed to fetch source tree", err);
		return [];
	}

	const findings: Finding[] = [];
	for (const file of files) {
		for (const check of SOURCE_CHECKS) {
			try {
				findings.push(...check(file.path, file.code));
			} catch (err) {
				console.error(`[audit] source check failed on ${file.path}`, err);
			}
		}
	}
	return findings;
}
