/**
 * Block review settings that live inside the vault (as `ReviewConfig.md`) so
 * they travel with the notes through Git and survive a fresh clone.
 */
export interface BlockReviewConfig {
    enabled: boolean;
    /**
     * Line inside a multi-line block that separates the prompt content from the
     * reveal section, e.g. `---`.
     */
    revealSeparator: string;
    /**
     * Prefix that starts a review block. `~! text` on one line is a single-line
     * block; a line that is exactly `~!` opens a multi-line block.
     */
    blockMarker: string;
    /** Line that closes a multi-line block, e.g. `!~`. */
    blockEndMarker: string;
    ignoredFolders: string[];
    ignoredTags: string[];
    ignoredFiles: string[];
    /** Advance to the next due block automatically after rating. */
    autoAdvance: boolean;
    /**
     * Note-level selection tags, e.g. `#review`. A note is scanned for review
     * blocks only when it carries one of these tags (in the body or frontmatter).
     * The tags present on the note also become the block's groups, so
     * `#readwise` on a note puts its blocks in the `readwise` group.
     */
    reviewTags: string[];
    /**
     * Groups (tags) the review queue is limited to. An empty array reviews every
     * block regardless of group.
     */
    activeGroups: string[];

    /**
     * Periodic background check for due block-review blocks. When enabled the
     * plugin pings the block review queue on a timer and surfaces a toast (and
     * optionally opens the panel) when blocks are due.
     */
    blockReviewRemindersEnabled: boolean;

    /** How often (in minutes) the reminder loop checks for due blocks. */
    blockReviewReminderIntervalMinutes: number;

    /** Show an Obsidian toast when due blocks are detected. */
    blockReviewReminderNotify: boolean;

    /** Automatically open the block review panel when due blocks are detected. */
    blockReviewReminderAutoOpen: boolean;

    /** Run a one-shot check on plugin startup. */
    blockReviewReminderCheckOnStartup: boolean;
}

export const BLOCK_REVIEW_CONFIG_FILE = "ReviewConfig.md";

export const BLOCK_REVIEW_DEFAULT_MARKER = "~!";
export const BLOCK_REVIEW_DEFAULT_END_MARKER = "!~";

export const DEFAULT_BLOCK_REVIEW_CONFIG: BlockReviewConfig = {
    enabled: true,
    revealSeparator: "---",
    blockMarker: BLOCK_REVIEW_DEFAULT_MARKER,
    blockEndMarker: BLOCK_REVIEW_DEFAULT_END_MARKER,
    ignoredFolders: [],
    ignoredTags: [],
    ignoredFiles: [],
    autoAdvance: true,
    reviewTags: ["#review"],
    activeGroups: [],
    blockReviewRemindersEnabled: false,
    blockReviewReminderIntervalMinutes: 5,
    blockReviewReminderNotify: true,
    blockReviewReminderAutoOpen: false,
    blockReviewReminderCheckOnStartup: true,
};

const CONFIG_JSON_BLOCK = /```json\s*([\s\S]*?)```/;

/**
 * Renders the config as a human-readable Markdown file with an embedded JSON
 * block. Keeping it Markdown (rather than raw JSON) makes the file pleasant to
 * open in Obsidian while remaining trivially diffable.
 */
export function serializeBlockReviewConfig(config: BlockReviewConfig): string {
    return [
        "# Block Review Configuration",
        "",
        "This file is managed by the **Block Review + Flashcards** plugin.",
        "It is intentionally plain text so it lives in your vault and syncs with Git.",
        "Edit the JSON below; the plugin rewrites it whenever settings change.",
        "",
        "```json",
        JSON.stringify(config, null, 2),
        "```",
        "",
    ].join("\n");
}

/**
 * Reads the JSON block out of a config file. Returns an empty object when the
 * file has no block or the JSON cannot be parsed.
 */
export function parseBlockReviewConfig(text: string): Partial<BlockReviewConfig> {
    const match = text.match(CONFIG_JSON_BLOCK);
    if (!match) {
        return {};
    }
    try {
        return JSON.parse(match[1]) as Partial<BlockReviewConfig>;
    } catch {
        return {};
    }
}

/**
 * Merges parsed (possibly partial or invalid) config with the defaults,
 * validating each field so a hand-edited file cannot break the plugin.
 */
export function mergeBlockReviewConfig(
    parsed: Partial<BlockReviewConfig> | null | undefined,
): BlockReviewConfig {
    const source = parsed ?? {};
    const blockMarker = sanitizeMarker(source.blockMarker, DEFAULT_BLOCK_REVIEW_CONFIG.blockMarker);
    const blockEndMarker = sanitizeMarker(
        source.blockEndMarker,
        DEFAULT_BLOCK_REVIEW_CONFIG.blockEndMarker,
    );
    const revealSeparator =
        typeof source.revealSeparator === "string" && source.revealSeparator.length > 0
            ? source.revealSeparator
            : DEFAULT_BLOCK_REVIEW_CONFIG.revealSeparator;

    return {
        enabled:
            typeof source.enabled === "boolean"
                ? source.enabled
                : DEFAULT_BLOCK_REVIEW_CONFIG.enabled,
        // Guard against legacy files that used the block marker as the reveal
        // separator (e.g. `~!`); the two would otherwise collide.
        revealSeparator:
            revealSeparator === blockMarker
                ? DEFAULT_BLOCK_REVIEW_CONFIG.revealSeparator
                : revealSeparator,
        blockMarker,
        blockEndMarker,
        ignoredFolders: Array.isArray(source.ignoredFolders) ? [...source.ignoredFolders] : [],
        ignoredTags: Array.isArray(source.ignoredTags) ? [...source.ignoredTags] : [],
        ignoredFiles: Array.isArray(source.ignoredFiles) ? [...source.ignoredFiles] : [],
        autoAdvance:
            typeof source.autoAdvance === "boolean"
                ? source.autoAdvance
                : DEFAULT_BLOCK_REVIEW_CONFIG.autoAdvance,
        reviewTags: sanitizeStringArray(source.reviewTags, DEFAULT_BLOCK_REVIEW_CONFIG.reviewTags),
        activeGroups: sanitizeStringArray(source.activeGroups, []),
        blockReviewRemindersEnabled:
            typeof source.blockReviewRemindersEnabled === "boolean"
                ? source.blockReviewRemindersEnabled
                : DEFAULT_BLOCK_REVIEW_CONFIG.blockReviewRemindersEnabled,
        blockReviewReminderIntervalMinutes: sanitizePositiveInt(
            source.blockReviewReminderIntervalMinutes,
            DEFAULT_BLOCK_REVIEW_CONFIG.blockReviewReminderIntervalMinutes,
        ),
        blockReviewReminderNotify:
            typeof source.blockReviewReminderNotify === "boolean"
                ? source.blockReviewReminderNotify
                : DEFAULT_BLOCK_REVIEW_CONFIG.blockReviewReminderNotify,
        blockReviewReminderAutoOpen:
            typeof source.blockReviewReminderAutoOpen === "boolean"
                ? source.blockReviewReminderAutoOpen
                : DEFAULT_BLOCK_REVIEW_CONFIG.blockReviewReminderAutoOpen,
        blockReviewReminderCheckOnStartup:
            typeof source.blockReviewReminderCheckOnStartup === "boolean"
                ? source.blockReviewReminderCheckOnStartup
                : DEFAULT_BLOCK_REVIEW_CONFIG.blockReviewReminderCheckOnStartup,
    };
}

function sanitizeMarker(value: unknown, fallback: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return fallback;
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) {
        return [...fallback];
    }
    return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    return fallback;
}
