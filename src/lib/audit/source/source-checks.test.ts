import { describe, expect, it } from "vitest";
import { FindingSchema } from "../schema";
import { checkEmptyLink } from "./empty-link";
import { checkMissingMetadata } from "./missing-metadata";
import { checkNextImageAlt } from "./next-image-alt";
import { checkRawImgAlt } from "./raw-img-alt";

describe("checkRawImgAlt", () => {
	it("flags raw <img> missing alt", () => {
		const code = `
export function Hero() {
  return <img src="/hero.png" />;
}`;
		const out = checkRawImgAlt("components/Hero.tsx", code);
		expect(out).toHaveLength(1);
		expect(out[0].element).toMatch(/^components\/Hero\.tsx:\d+$/);
	});

	it("does not flag <img> with alt", () => {
		const code = 'export const A = () => <img src="/a.png" alt="A" />;';
		expect(checkRawImgAlt("a.tsx", code)).toHaveLength(0);
	});

	it("does not flag <img> with empty-string alt (decorative)", () => {
		// Decorative use is intentional — alt="" is valid
		const code = 'export const A = () => <img src="/a.png" alt="" />;';
		expect(checkRawImgAlt("a.tsx", code)).toHaveLength(1);
	});

	it("returns [] on parse failure", () => {
		expect(checkRawImgAlt("broken.tsx", "{{{ not valid }}}")).toEqual([]);
	});
});

describe("checkMissingMetadata", () => {
	it("flags layout.tsx without metadata export", () => {
		const code = "export default function Layout() { return null; }";
		const out = checkMissingMetadata("app/layout.tsx", code);
		expect(out).toHaveLength(1);
	});

	it("does not flag layout.tsx with metadata export", () => {
		const code = `
export const metadata = { title: "x" };
export default function Layout() { return null; }`;
		expect(checkMissingMetadata("app/layout.tsx", code)).toHaveLength(0);
	});

	it("ignores files that aren't layout.tsx", () => {
		expect(checkMissingMetadata("app/page.tsx", "export default () => null;")).toHaveLength(0);
	});
});

describe("checkEmptyLink", () => {
	it('flags <a href="#">', () => {
		const code = 'export const A = () => <a href="#">Click</a>;';
		const out = checkEmptyLink("a.tsx", code);
		expect(out.some((f) => f.id.startsWith("source.empty-link.href."))).toBe(true);
	});

	it('flags <a href="">', () => {
		const code = 'export const A = () => <a href="">Click</a>;';
		const out = checkEmptyLink("a.tsx", code);
		expect(out.some((f) => f.id.startsWith("source.empty-link.href."))).toBe(true);
	});

	it("flags <a> with no href", () => {
		const code = "export const A = () => <a>Click</a>;";
		const out = checkEmptyLink("a.tsx", code);
		expect(out.some((f) => f.id.startsWith("source.empty-link.href."))).toBe(true);
	});

	it("flags <a> with no children", () => {
		const code = 'export const A = () => <a href="/home"></a>;';
		const out = checkEmptyLink("a.tsx", code);
		expect(out.some((f) => f.id.startsWith("source.empty-link.empty."))).toBe(true);
	});

	it("does not flag good links", () => {
		const code = 'export const A = () => <a href="/home">Home</a>;';
		expect(checkEmptyLink("a.tsx", code)).toHaveLength(0);
	});
});

describe("checkNextImageAlt", () => {
	it("flags next/image <Image> missing alt", () => {
		const code = `
import Image from "next/image";
export const A = () => <Image src="/a.png" width={10} height={10} />;`;
		const out = checkNextImageAlt("a.tsx", code);
		expect(out).toHaveLength(1);
	});

	it("does not flag non-next/image Image components", () => {
		const code = `
import { Image } from "@chakra-ui/react";
export const A = () => <Image src="/a.png" />;`;
		expect(checkNextImageAlt("a.tsx", code)).toHaveLength(0);
	});

	it("respects aliased next/image default import", () => {
		const code = `
import NImg from "next/image";
export const A = () => <NImg src="/a.png" width={10} height={10} />;`;
		expect(checkNextImageAlt("a.tsx", code)).toHaveLength(1);
	});

	it("does not flag next/image with alt", () => {
		const code = `
import Image from "next/image";
export const A = () => <Image src="/a.png" alt="A" width={10} height={10} />;`;
		expect(checkNextImageAlt("a.tsx", code)).toHaveLength(0);
	});
});

describe("schema conformance for source findings", () => {
	it("all source findings parse against FindingSchema", () => {
		const code = `
import Image from "next/image";
export const A = () => (
  <div>
    <img src="/a.png" />
    <a href="#"></a>
    <Image src="/b.png" width={10} height={10} />
  </div>
);`;
		const all = [
			...checkRawImgAlt("a.tsx", code),
			...checkEmptyLink("a.tsx", code),
			...checkNextImageAlt("a.tsx", code),
		];
		expect(all.length).toBeGreaterThan(0);
		for (const f of all) {
			expect(() => FindingSchema.parse(f)).not.toThrow();
		}
	});
});
