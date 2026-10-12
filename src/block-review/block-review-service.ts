import { App, TFile } from "obsidian";

import {
    BlockReviewParseOptions,
    normalizeTag,
    parseNote,
} from "src/block-review/block-review-parser";
import { upsertScheduleRecord } from "src/block-review/block-review-text";
import { serializeBlockSchedule } from "src/block-review/block-schedule-record";
import { BlockReviewItem } from "src/block-review/types";
import { BlockReviewConfig } from "src/block-review/vault-config";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";

/**
 * Obsidian-coupled side of block review: scans the vault for review blocks and
 * persists schedule records back into the notes. All parsing/serialization is
 * delegated to the pure modules so the logic stays unit tested.
 */
export class BlockReviewService {
    private readonly app: App;
    private config: BlockReviewConfig;

    constructor(app: App, config: BlockReviewConfig) {
        this.app = app;
        this.config = config;
    }

    updateConfig(config: BlockReviewConfig): void {
        this.config = config;
    }

    async scanVault(): Promise<BlockReviewItem[]> {
        const items: BlockReviewItem[] = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            const found = await this.scanFile(file);
            items.push(...found);
        }
        return items;
    }

    /** Every distinct group (tag) currently used by a review block. */
    async listGroups(): Promise<string[]> {
        const items = await this.scanVault();
        const groups = new Set<string>();
        items.forEach((item) => item.tags.forEach((tag) => groups.add(tag)));
        return [...groups].sort((left, right) => left.localeCompare(right));
    }

    async scanFile(file: TFile): Promise<BlockReviewItem[]> {
        if (this.isIgnored(file)) {
            return [];
        }

        const text = await this.app.vault.cachedRead(file);
        const noteGroups = this.noteReviewTags(file, text);
        if (noteGroups.length === 0) {
            return [];
        }

        return parseNote(file.path, text, this.parseOptions(noteGroups));
    }

    /**
     * Writes the given schedule into the note's end-of-file state region. The
     * note is re-parsed first so the block id stays accurate even if the file
     * changed since the scan.
     */
    async applyReview(item: BlockReviewItem, schedule: RepItemScheduleInfo): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.notePath);
        if (!(file instanceof TFile)) {
            return;
        }

        const text = await this.app.vault.read(file);
        const noteGroups = this.noteReviewTags(file, text);
        const freshItems = parseNote(item.notePath, text, this.parseOptions(noteGroups));
        const target = freshItems.find((candidate) => candidate.id === item.id);
        if (!target) {
            return;
        }

        const recordLine = serializeBlockSchedule(target.id, schedule);
        const updated = upsertScheduleRecord(text, target.id, recordLine);
        if (updated !== text) {
            await this.app.vault.modify(file, updated);
        }
    }

    private parseOptions(noteGroups: string[]): BlockReviewParseOptions {
        return {
            separator: this.config.revealSeparator,
            blockMarker: this.config.blockMarker,
            blockEndMarker: this.config.blockEndMarker,
            noteGroups,
        };
    }

    /**
     * The configured review tags present on the note (body or frontmatter).
     * A note is only scanned when this is non-empty; the tags double as the
     * block groups.
     */
    private noteReviewTags(file: TFile, text: string): string[] {
        const configured = this.config.reviewTags.map((tag) => normalizeTag(tag)).filter(Boolean);
        if (configured.length === 0) {
            return [];
        }

        const found = new Set<string>();
        const add = (raw: string): void => {
            const normalized = normalizeTag(raw);
            if (
                normalized.length > 0 &&
                configured.some((tag) => normalized === tag || normalized.startsWith(`${tag}/`))
            ) {
                found.add(normalized);
            }
        };

        const cache = this.app.metadataCache.getFileCache(file);
        cache?.tags?.forEach((entry) => add(entry.tag));
        const frontmatterTags = cache?.frontmatter?.tags as unknown;
        if (Array.isArray(frontmatterTags)) {
            frontmatterTags.forEach((tag) => add(String(tag)));
        } else if (typeof frontmatterTags === "string") {
            add(frontmatterTags);
        }

        const inlineTag = /#[\w/-]+/g;
        let match: RegExpExecArray | null;
        while ((match = inlineTag.exec(text)) !== null) {
            add(match[0]);
        }

        return [...found];
    }

    private isIgnored(file: TFile): boolean {
        if (this.config.ignoredFiles.includes(file.path)) {
            return true;
        }

        const ignoredByFolder = this.config.ignoredFolders.some((folder) => {
            const normalized = folder.replace(/\/+$/, "");
            return (
                normalized.length > 0 &&
                (file.path === normalized || file.path.startsWith(`${normalized}/`))
            );
        });
        if (ignoredByFolder) {
            return true;
        }

        return this.config.ignoredTags.length > 0 && this.hasIgnoredTag(file);
    }

    private hasIgnoredTag(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        const tags: string[] = [];
        cache?.tags?.forEach((entry) => tags.push(entry.tag));

        const frontmatterTags = cache?.frontmatter?.tags as unknown;
        if (Array.isArray(frontmatterTags)) {
            frontmatterTags.forEach((tag) => tags.push(String(tag)));
        } else if (typeof frontmatterTags === "string") {
            tags.push(frontmatterTags);
        }

        const ignored = this.config.ignoredTags.map((tag) =>
            tag.startsWith("#") ? tag : `#${tag}`,
        );
        return tags.some((tag) => {
            const normalized = tag.startsWith("#") ? tag : `#${tag}`;
            return ignored.some(
                (entry) => normalized === entry || normalized.startsWith(`${entry}/`),
            );
        });
    }
}
