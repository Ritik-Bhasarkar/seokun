import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { runCheerioChecks } from "./cheerio-checks";
import { FindingSchema } from "./schema";

function findings(html: string) {
	return runCheerioChecks(load(html));
}

describe("cheerio checks", () => {
	it("flags <img> missing alt", () => {
		const out = findings('<html><body><img src="/a.png"></body></html>');
		expect(out.some((f) => f.id.startsWith("cheerio.img-alt."))).toBe(true);
	});

	it("does not flag <img> with non-empty alt", () => {
		const out = findings('<html><body><img src="/a.png" alt="A diagram"></body></html>');
		expect(out.find((f) => f.id.startsWith("cheerio.img-alt."))).toBeUndefined();
	});

	it("flags missing meta description", () => {
		const out = findings("<html><head></head><body></body></html>");
		expect(out.find((f) => f.id === "cheerio.meta-description")).toBeDefined();
	});

	it("does not flag meta description when present", () => {
		const out = findings(
			'<html><head><meta name="description" content="x"></head></html>',
		);
		expect(out.find((f) => f.id === "cheerio.meta-description")).toBeUndefined();
	});

	it("flags missing og:title / og:description / og:image", () => {
		const out = findings("<html><head></head></html>");
		expect(out.find((f) => f.id === "cheerio.og-title")).toBeDefined();
		expect(out.find((f) => f.id === "cheerio.og-description")).toBeDefined();
		expect(out.find((f) => f.id === "cheerio.og-image")).toBeDefined();
	});

	it("flags missing/empty <title> as critical", () => {
		const out = findings("<html><head></head></html>");
		const t = out.find((f) => f.id === "cheerio.title");
		expect(t?.severity).toBe("critical");
	});

	it("every finding conforms to FindingSchema", () => {
		const out = findings('<html><head></head><body><img src="x"></body></html>');
		for (const f of out) {
			expect(() => FindingSchema.parse(f)).not.toThrow();
		}
	});
});
