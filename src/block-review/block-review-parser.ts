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

    const isStartMarkerLine = (trimmedLine: string): boolean =>
        trimmedLine === blockMarker || trimmedLine.startsWith(blockMarker);

    /**
     * Whether a closing marker appears before the next opening marker. Used to
     * decide if a `marker text` line is a single-line block (nothing closes it)
     * or the first line of a multi-line block (a closer follows).
     */
    const hasCloserAhead = (from: number): boolean => {
        for (let j = from; j < lines.length; j++) {
            if (BLOCK_SCHEDULE_RECORD_MARKER.test(lines[j])) {
                continue;
            }
            const candidate = lines[j].trim();
            if (candidate === blockEndMarker) {
                return true;
            }
            if (isStartMarkerLine(candidate)) {
                return false;
            }
        }
        return false;
    };

    const flushBlock = (endLine: number): void => {
        const raw = contentLines.join("\n").trim();
        const { content, extra } = splitBlockContent(raw, separator);
        const item = createItem(
            notePath,
            content,
            extra,
            extra ? "flashcard" : "recall",
            openLine,
            endLine,
            schedules,
            noteGroups,
        );
        if (item) {
            items.push(item);
        }
        inBlock = false;
        openLine = -1;
        contentLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (inBlock) {
            // The end marker must sit on its own line; a content line that
            // merely ends with the marker text no longer closes the block.
            if (trimmed === blockEndMarker) {
                flushBlock(i);
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

        if (!isStartMarkerLine(trimmed)) {
            continue;
        }

        const afterMarker = trimmed.slice(blockMarker.length);
        const inlineText = afterMarker.trim();
        const isSingleLineForm =
            afterMarker.startsWith(" ") && inlineText.length > 0 && !hasCloserAhead(i + 1);

        if (isSingleLineForm) {
            const item = createItem(
                notePath,
                inlineText,
                null,
                "recall",
                i,
                i,
                schedules,
                noteGroups,
            );
            if (item) {
                items.push(item);
            }
            continue;
        }

        inBlock = true;
        openLine = i;
        contentLines = [];
        if (inlineText.length > 0) {
            contentLines.push(inlineText);
        }
    }

    return items;
}
