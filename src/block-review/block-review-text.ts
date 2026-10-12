import { BLOCK_SCHEDULE_RECORD_MARKER } from "src/block-review/block-review-parser";
import { parseBlockSchedule } from "src/block-review/block-schedule-record";

/**
 * Markers delimiting the schedule region kept at the end of a note. Everything
 * between them is `%% sr-block %%` records, one per reviewed block.
 */
export const BLOCK_REVIEW_STATE_OPEN = "%% block-review-state %%";
export const BLOCK_REVIEW_STATE_CLOSE = "%% /block-review-state %%";

function detectEol(text: string): string {
    return text.includes("\r\n") ? "\r\n" : "\n";
}

interface ScheduleRegion {
    /** Index of the opening marker line. */
    start: number;
    /** Index just past the closing marker (or end of file when unclosed). */
    end: number;
    /** The record lines held inside the region, in file order. */
    records: string[];
}

function locateRegion(lines: string[]): ScheduleRegion | null {
    const start = lines.findIndex((line) => line.trim() === BLOCK_REVIEW_STATE_OPEN);
    if (start === -1) {
        return null;
    }

    let close = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === BLOCK_REVIEW_STATE_CLOSE) {
            close = i;
            break;
        }
    }

    const end = close === -1 ? lines.length : close + 1;
    const records: string[] = [];
    for (let i = start + 1; i < end; i++) {
        if (BLOCK_SCHEDULE_RECORD_MARKER.test(lines[i])) {
            records.push(lines[i]);
        }
    }
    return { start, end, records };
}

function recordId(line: string): string | null {
    return parseBlockSchedule(line)?.id ?? null;
}

function baseWithoutRegion(lines: string[], region: ScheduleRegion | null): string[] {
    const base = region
        ? [...lines.slice(0, region.start), ...lines.slice(region.end)]
        : [...lines];
    while (base.length > 0 && base[base.length - 1].trim() === "") {
        base.pop();
    }
    return base;
}

/**
 * Inserts or replaces the hidden schedule record for `id` in the note's
 * end-of-file state region. The region is (re)created when missing, and its
 * records keep their file order.
 */
export function upsertScheduleRecord(text: string, id: string, recordLine: string): string {
    const lines = text.split(/\r?\n/);
    const region = locateRegion(lines);

    const records = region ? [...region.records] : [];
    let replaced = false;
    const next = records.map((record) => {
        if (!replaced && recordId(record) === id) {
            replaced = true;
            return recordLine;
        }
        return record;
    });
    if (!replaced) {
        next.push(recordLine);
    }

    const base = baseWithoutRegion(lines, region);
    base.push("", BLOCK_REVIEW_STATE_OPEN, ...next, BLOCK_REVIEW_STATE_CLOSE, "");
    return base.join(detectEol(text));
}

/**
 * Removes the hidden schedule record for `id`. When no records remain the whole
 * state region is removed so the note stays clean.
 */
export function removeScheduleRecord(text: string, id: string): string {
    const lines = text.split(/\r?\n/);
    const region = locateRegion(lines);
    if (!region) {
        return text;
    }

    const remaining = region.records.filter((record) => recordId(record) !== id);
    const base = baseWithoutRegion(lines, region);
    if (remaining.length > 0) {
        base.push("", BLOCK_REVIEW_STATE_OPEN, ...remaining, BLOCK_REVIEW_STATE_CLOSE, "");
    } else {
        base.push("");
    }
    return base.join(detectEol(text));
}

/**
 * Drops every schedule record whose id is not in `validIds`, e.g. after block
 * content changed and the id was re-derived. Returns the text unchanged when
 * there is no region.
 */
export function pruneScheduleRecords(text: string, validIds: Set<string>): string {
    const lines = text.split(/\r?\n/);
    const region = locateRegion(lines);
    if (!region) {
        return text;
    }

    const remaining = region.records.filter((record) => {
        const id = recordId(record);
        return id !== null && validIds.has(id);
    });
    if (remaining.length === region.records.length) {
        return text;
    }

    const base = baseWithoutRegion(lines, region);
    if (remaining.length > 0) {
        base.push("", BLOCK_REVIEW_STATE_OPEN, ...remaining, BLOCK_REVIEW_STATE_CLOSE, "");
    } else {
        base.push("");
    }
    return base.join(detectEol(text));
}
