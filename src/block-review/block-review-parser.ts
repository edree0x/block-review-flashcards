import {
    BLOCK_REVIEW_DEFAULT_SEPARATOR,
    BlockReviewItem,
    BlockReviewType,
} from "src/block-review/types";
import {
    BLOCK_REVIEW_DEFAULT_END_MARKER,
    BLOCK_REVIEW_DEFAULT_MARKER,
} from "src/block-review/vault-config";
import { ISerializedScheduleEntry } from "src/data/plugin-data";
import { RepItemScheduleFactory } from "src/scheduling/algorithms/base/rep-item-info-factory";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";

export const BLOCK_SCHEDULE_RECORD_MARKER = /^%%\s*sr-block\s*(\{.*\})\s*%%\s*$/;

export function normalizeTag(tag: string): string {
    let normalized = tag.trim();
    while (normalized.startsWith("#")) {
        normalized = normalized.slice(1);
    }
    normalized = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
    return normalized.toLowerCase();
}

export interface ParsedBlockContent {
    content: string;
    extra: string | null;
}

export function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

export function deriveBlockId(notePath: string, content: string): string {
    return `b-${hashString(`${notePath}\u0000${content}`)}`;
}

export function splitBlockContent(
    rawContent: string,
    separator: string = BLOCK_REVIEW_DEFAULT_SEPARATOR,
): ParsedBlockContent {
    const normalizedSeparator = separator.trim();
    const lines = rawContent.split(/\r?\n/);
    const separatorIndex =
        normalizedSeparator.length > 0
            ? lines.findIndex((line) => line.trim() === normalizedSeparator)
            : -1;

    if (separatorIndex === -1) {
        return { content: rawContent.trim(), extra: null };
    }

    const content = lines.slice(0, separatorIndex).join("\n").trim();
    const extra = lines.slice(separatorIndex + 1).join("\n").trim();
    return { content, extra: extra.length > 0 ? extra : null };
}

function collectSchedules(lines: string[]): Map<string, RepItemScheduleInfo> {
    const schedules = new Map<string, RepItemScheduleInfo>();
    for (const line of lines) {
        const match = line.match(BLOCK_SCHEDULE_RECORD_MARKER);
        if (!match) {
            continue;
        }
        try {
            const payload = JSON.parse(match[1]) as {
                id?: string;
                schedule?: ISerializedScheduleEntry;
            };
            if (payload.id && payload.schedule) {
                schedules.set(
                    payload.id,
                    RepItemScheduleFactory.create(payload.schedule.algorithm, payload.schedule),
                );
            }
        } catch {
            // Ignore malformed schedule records
        }
    }
    return schedules;
}

export interface BlockReviewParseOptions {
    separator?: string;
    blockMarker?: string;
    blockEndMarker?: string;
    noteGroups?: string[];
}

function createItem(
    notePath: string,
    content: string,
    extra: string | null,
    type: BlockReviewType,
    startLine: number,
    endLine: number,
    schedules: Map<string, RepItemScheduleInfo>,
    noteGroups: string[],
): BlockReviewItem | null {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const id = deriveBlockId(notePath, trimmed);
    return {
        id,
        type,
        source: null,
        content: trimmed,
        extra,
        schedule: schedules.get(id) ?? null,
        notePath,
        startLine,
        endLine,
        tags: [...noteGroups],
    };
}

export function parseNote(
    notePath: string,
    text: string,
    options: BlockReviewParseOptions = {},
): BlockReviewItem[] {
    const separator = options.separator ?? BLOCK_REVIEW_DEFAULT_SEPARATOR;
    const blockMarker = options.blockMarker ?? BLOCK_REVIEW_DEFAULT_MARKER;
    const blockEndMarker = options.blockEndMarker ?? BLOCK_REVIEW_DEFAULT_END_MARKER;
    const noteGroups = (options.noteGroups ?? []).map(normalizeTag).filter(Boolean);

    const lines = text.split(/\r?\n/);
    const schedules = collectSchedules(lines);
    const items: BlockReviewItem[] = [];

    let inBlock = false;
    let openLine = -1;
    let contentLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (inBlock) {
            const isEndOwnLine = trimmed === blockEndMarker;
            const isEndAtLineEnd =
                blockEndMarker.length > 0 &&
                line.trimEnd().endsWith(blockEndMarker) &&
                !BLOCK_SCHEDULE_RECORD_MARKER.test(line);

            if (isEndOwnLine || isEndAtLineEnd) {
                const contentForThisLine = isEndAtLineEnd && !isEndOwnLine
                    ? line.slice(0, line.trimEnd().lastIndexOf(blockEndMarker))
                    : "";

                const fullContentLines = [...contentLines];
                if (contentForThisLine.length > 0) {
                    fullContentLines.push(contentForThisLine);
                } else if (isEndAtLineEnd && !isEndOwnLine && contentForThisLine.length === 0) {
                    // Marker at end with nothing before - empty line to add if not already
                    // but we need to handle correctly
                }
                // if end is own line, don't add current line content
                const raw = fullContentLines.join("\n").trim();
                const { content, extra } = splitBlockContent(raw, separator);
                const item = createItem(
                    notePath,
                    content,
                    extra,
                    extra ? "flashcard" : "recall",
                    openLine,
                    i,
                    schedules,
                    noteGroups,
                );
                if (item) {
                    items.push(item);
                }
                inBlock = false;
                openLine = -1;
                contentLines = [];
                continue;
            }
            if (!BLOCK_SCHEDULE_RECORD_MARKER.test(line)) {
                contentLines.push(line);
            }
            continue;
        }

        if (BLOCK_SCHEDULE_RECORD_MARKER.test(line)) {
            continue;
        }

        // Single-line style: marker followed by space (preserve existing behavior)
        if (trimmed.startsWith(`${blockMarker} `)) {
            const content = trimmed.slice(blockMarker.length).trim();
            const item = createItem(notePath, content, null, "recall", i, i, schedules, noteGroups);
            if (item) {
                items.push(item);
            }
            continue;
        }

        if (trimmed === blockMarker || line.startsWith(blockMarker)) {
            inBlock = true;
            openLine = i;
            contentLines = [];
            if (trimmed !== blockMarker && line.startsWith(blockMarker)) {
                const after = line.slice(blockMarker.length);
                if (after.includes(blockEndMarker) && blockEndMarker.length > 0) {
                    const endIdx = after.lastIndexOf(blockEndMarker);
                    contentLines.push(after.slice(0, endIdx));
                    const raw = contentLines.join("\n").trim();
                    const { content, extra } = splitBlockContent(raw, separator);
                    const item = createItem(
                        notePath,
                        content,
                        extra,
                        extra ? "flashcard" : "recall",
                        openLine,
                        i,
                        schedules,
                        noteGroups,
                    );
                    if (item) {
                        items.push(item);
                    }
                    inBlock = false;
                    openLine = -1;
                    contentLines = [];
                } else if (after.trim().length > 0 || after.length > 0) {
                    if (!(trimmed === blockMarker)) {
                        contentLines.push(after);
                    }
                }
            }
            continue;
        }
    }

    return items;
}
