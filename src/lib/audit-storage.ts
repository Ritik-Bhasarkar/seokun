"use client";

import type { AuditReport } from "./audit/schema";

const REPORT_PREFIX = "seokun:audit:";
const INDEX_KEY = "seokun:audit:index";
const INDEX_LIMIT = 20;

type IndexEntry = {
	id: string;
	url: string;
	score: number;
	auditedAt: string;
};

function readIndex(): IndexEntry[] {
	try {
		const raw = window.localStorage.getItem(INDEX_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as IndexEntry[]) : [];
	} catch {
		return [];
	}
}

function writeIndex(entries: IndexEntry[]): void {
	try {
		window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
	} catch {
		// ignore quota errors
	}
}

function averageScore(report: AuditReport): number {
	const { seo, performance, accessibility, bestPractices } = report.scores;
	return Math.round((seo + performance + accessibility + bestPractices) / 4);
}

export function saveReport(report: AuditReport): void {
	try {
		window.localStorage.setItem(
			REPORT_PREFIX + report.id,
			JSON.stringify(report),
		);
		const entries = readIndex().filter((e) => e.id !== report.id);
		entries.unshift({
			id: report.id,
			url: report.url,
			score: averageScore(report),
			auditedAt: report.auditedAt,
		});
		if (entries.length > INDEX_LIMIT) {
			const dropped = entries.slice(INDEX_LIMIT);
			for (const e of dropped) {
				window.localStorage.removeItem(REPORT_PREFIX + e.id);
			}
		}
		writeIndex(entries.slice(0, INDEX_LIMIT));
	} catch {
		// ignore quota errors
	}
}

export function loadReport(id: string): AuditReport | null {
	try {
		const raw = window.localStorage.getItem(REPORT_PREFIX + id);
		if (!raw) return null;
		return JSON.parse(raw) as AuditReport;
	} catch {
		return null;
	}
}

export function listRecent(): IndexEntry[] {
	return readIndex();
}

export function deleteReport(id: string): void {
	try {
		window.localStorage.removeItem(REPORT_PREFIX + id);
		writeIndex(readIndex().filter((e) => e.id !== id));
	} catch {
		// ignore
	}
}

export function formatRelative(iso: string, now: number = Date.now()): string {
	const then = Date.parse(iso);
	const diffSec = Math.max(0, Math.round((now - then) / 1000));
	if (diffSec < 60) return "just now";
	const diffMin = Math.round(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.round(diffHr / 24);
	return `${diffDay}d ago`;
}
