import { describe, expect, it } from "vitest";
import { FindingSchema } from "../schema";
import { checkDivAsButton } from "./div-as-button";
import { checkHeadingHierarchy } from "./heading-hierarchy";
import { checkIconButtonLabel } from "./icon-button-label";
import { checkInputWithoutLabel } from "./input-without-label";
import { checkSyncHeavyImports } from "./sync-heavy-imports";
import { checkTargetBlankRel } from "./target-blank-rel";

describe("checkIconButtonLabel", () => {
	it("flags icon-only button without aria-label", () => {
		const code = `
export const X = () => (
  <button><IconClose /></button>
);`;
		const out = checkIconButtonLabel("a.tsx", code);
		expect(out).toHaveLength(1);
		expect(out[0].severity).toBe("warning");
	});

	it("does not flag button with aria-label", () => {
		const code = `
export const X = () => (
  <button aria-label="Close"><IconClose /></button>
);`;
		expect(checkIconButtonLabel("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag button with text children", () => {
		const code = `
export const X = () => (
  <button><IconClose />Close</button>
);`;
		expect(checkIconButtonLabel("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkInputWithoutLabel", () => {
	it("flags input without label or aria-label", () => {
		const code = `
export const X = () => <input type="email" placeholder="email" />;`;
		expect(checkInputWithoutLabel("a.tsx", code)).toHaveLength(1);
	});

	it("does not flag input with matching htmlFor", () => {
		const code = `
export const X = () => (
  <>
    <label htmlFor="email">Email</label>
    <input id="email" type="email" />
  </>
);`;
		expect(checkInputWithoutLabel("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag input with aria-label", () => {
		const code = `
export const X = () => <input type="email" aria-label="Email" />;`;
		expect(checkInputWithoutLabel("a.tsx", code)).toHaveLength(0);
	});

	it("skips hidden and submit inputs", () => {
		const code = `
export const X = () => (
  <>
    <input type="hidden" name="csrf" />
    <input type="submit" value="Send" />
  </>
);`;
		expect(checkInputWithoutLabel("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkDivAsButton", () => {
	it("flags <div onClick> without role=button", () => {
		const code = `
export const X = () => <div onClick={() => {}}>Go</div>;`;
		expect(checkDivAsButton("a.tsx", code)).toHaveLength(1);
	});

	it("does not flag <div onClick role=\"button\" tabIndex>", () => {
		const code = `
export const X = () => <div onClick={() => {}} role="button" tabIndex={0}>Go</div>;`;
		expect(checkDivAsButton("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag a real button", () => {
		const code = `
export const X = () => <button onClick={() => {}}>Go</button>;`;
		expect(checkDivAsButton("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkTargetBlankRel", () => {
	it("flags <a target=_blank> without rel", () => {
		const code = `
export const X = () => <a href="/x" target="_blank">go</a>;`;
		expect(checkTargetBlankRel("a.tsx", code)).toHaveLength(1);
	});

	it("does not flag with rel=noopener", () => {
		const code = `
export const X = () => <a href="/x" target="_blank" rel="noopener noreferrer">go</a>;`;
		expect(checkTargetBlankRel("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag without target=_blank", () => {
		const code = `
export const X = () => <a href="/x">go</a>;`;
		expect(checkTargetBlankRel("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkHeadingHierarchy", () => {
	it("flags <h1> followed by <h3>", () => {
		const code = `
export const X = () => (
  <>
    <h1>Title</h1>
    <h3>Sub</h3>
  </>
);`;
		const out = checkHeadingHierarchy("a.tsx", code);
		expect(out.some((f) => f.title.includes("skips level"))).toBe(true);
	});

	it("flags multiple <h1>", () => {
		const code = `
export const X = () => (
  <>
    <h1>A</h1>
    <h1>B</h1>
  </>
);`;
		const out = checkHeadingHierarchy("a.tsx", code);
		expect(out.some((f) => f.id.includes("multiple-h1"))).toBe(true);
	});

	it("does not flag well-formed hierarchy", () => {
		const code = `
export const X = () => (
  <>
    <h1>A</h1>
    <h2>B</h2>
    <h3>C</h3>
    <h2>D</h2>
  </>
);`;
		expect(checkHeadingHierarchy("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkSyncHeavyImports", () => {
	it("flags top-level static import of lodash", () => {
		const code = `import _ from "lodash"; export const x = _.uniq([1, 1]);`;
		const out = checkSyncHeavyImports("a.tsx", code);
		expect(out).toHaveLength(1);
		expect(out[0].title).toMatch(/lodash/);
	});

	it("flags scoped dep like @tensorflow/tfjs", () => {
		const code = `import * as tf from "@tensorflow/tfjs";`;
		expect(checkSyncHeavyImports("a.tsx", code)).toHaveLength(1);
	});

	it("does not flag known-light deps", () => {
		const code = `import { z } from "zod"; import React from "react";`;
		expect(checkSyncHeavyImports("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag dynamic import expression (it's not an ImportDeclaration)", () => {
		const code = `export const x = () => import("moment");`;
		expect(checkSyncHeavyImports("a.tsx", code)).toHaveLength(0);
	});
});

describe("schema conformance", () => {
	it("all new-check findings parse against FindingSchema", () => {
		const code = `
import _ from "lodash";
export const X = () => (
  <>
    <h1>A</h1>
    <h3>B</h3>
    <button><IconClose /></button>
    <input type="email" />
    <div onClick={() => {}}>Go</div>
    <a href="/x" target="_blank">go</a>
  </>
);`;
		const all = [
			...checkIconButtonLabel("a.tsx", code),
			...checkInputWithoutLabel("a.tsx", code),
			...checkDivAsButton("a.tsx", code),
			...checkTargetBlankRel("a.tsx", code),
			...checkHeadingHierarchy("a.tsx", code),
			...checkSyncHeavyImports("a.tsx", code),
		];
		expect(all.length).toBeGreaterThan(0);
		for (const f of all) {
			expect(() => FindingSchema.parse(f)).not.toThrow();
		}
	});
});
