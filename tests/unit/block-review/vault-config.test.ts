import {
    DEFAULT_BLOCK_REVIEW_CONFIG,
    mergeBlockReviewConfig,
    parseBlockReviewConfig,
    serializeBlockReviewConfig,
} from "src/block-review/vault-config";

describe("vault config", () => {
    test("round-trips a full config through serialize/parse", () => {
        const config = {
            ...DEFAULT_BLOCK_REVIEW_CONFIG,
            revealSeparator: "===",
            ignoredFolders: ["Archive"],
            ignoredTags: ["#muted"],
            ignoredFiles: ["template.md"],
            autoAdvance: false,
        };
        const text = serializeBlockReviewConfig(config);
        const merged = mergeBlockReviewConfig(parseBlockReviewConfig(text));
        expect(merged).toEqual(config);
    });

    test("writes defaults as readable markdown with a json block", () => {
        const text = serializeBlockReviewConfig(DEFAULT_BLOCK_REVIEW_CONFIG);
        expect(text.includes("# Block Review Configuration")).toEqual(true);
        expect(text.includes("```json")).toEqual(true);
    });

    test("falls back to defaults when there is no json block", () => {
        expect(parseBlockReviewConfig("no json here")).toEqual({});
        expect(mergeBlockReviewConfig(parseBlockReviewConfig("no json here"))).toEqual(
            DEFAULT_BLOCK_REVIEW_CONFIG,
        );
    });

    test("falls back to defaults when the json is malformed", () => {
        const text = "```json\n{not valid}\n```";
        expect(parseBlockReviewConfig(text)).toEqual({});
        expect(mergeBlockReviewConfig(parseBlockReviewConfig(text))).toEqual(
            DEFAULT_BLOCK_REVIEW_CONFIG,
        );
    });

    test("validates individual fields from a hand-edited file", () => {
        const text = '```json\n{"enabled":"yes","revealSeparator":"","autoAdvance":"nope"}\n```';
        const merged = mergeBlockReviewConfig(parseBlockReviewConfig(text));
        expect(merged.enabled).toEqual(DEFAULT_BLOCK_REVIEW_CONFIG.enabled);
        expect(merged.revealSeparator).toEqual(DEFAULT_BLOCK_REVIEW_CONFIG.revealSeparator);
        expect(merged.autoAdvance).toEqual(DEFAULT_BLOCK_REVIEW_CONFIG.autoAdvance);
    });

    test("accepts valid overrides and deep-copies arrays", () => {
        const folders = ["Archive"];
        const merged = mergeBlockReviewConfig({ ignoredFolders: folders });
        expect(merged.ignoredFolders).toEqual(["Archive"]);
        merged.ignoredFolders.push("Other");
        expect(folders).toEqual(["Archive"]);
    });

    test("defaults review tags and active groups", () => {
        const merged = mergeBlockReviewConfig({});
        expect(merged.reviewTags).toEqual(DEFAULT_BLOCK_REVIEW_CONFIG.reviewTags);
        expect(merged.activeGroups).toEqual([]);
    });

    test("round-trips custom review tags and active groups", () => {
        const config = {
            ...DEFAULT_BLOCK_REVIEW_CONFIG,
            reviewTags: ["#review", "#goal"],
            activeGroups: ["math", "review/math"],
        };
        const merged = mergeBlockReviewConfig(
            parseBlockReviewConfig(serializeBlockReviewConfig(config)),
        );
        expect(merged.reviewTags).toEqual(["#review", "#goal"]);
        expect(merged.activeGroups).toEqual(["math", "review/math"]);
    });

    test("sanitizes review tags and active groups from a hand-edited file", () => {
        const text = '```json\n{"reviewTags":["  #review  ",""],"activeGroups":"math"}\n```';
        const merged = mergeBlockReviewConfig(parseBlockReviewConfig(text));
        expect(merged.reviewTags).toEqual(["#review"]);
        expect(merged.activeGroups).toEqual([]);
    });

    test("defaults the block markers", () => {
        const merged = mergeBlockReviewConfig({});
        expect(merged.blockMarker).toEqual("~!");
        expect(merged.blockEndMarker).toEqual("!~");
    });

    test("accepts custom markers and trims whitespace", () => {
        const merged = mergeBlockReviewConfig({ blockMarker: "  ??  ", blockEndMarker: "!!" });
        expect(merged.blockMarker).toEqual("??");
        expect(merged.blockEndMarker).toEqual("!!");
    });

    test("falls back to default markers when blank", () => {
        const merged = mergeBlockReviewConfig({ blockMarker: "   ", blockEndMarker: "" });
        expect(merged.blockMarker).toEqual("~!");
        expect(merged.blockEndMarker).toEqual("!~");
    });

    test("migrates a reveal separator that collides with the block marker", () => {
        const merged = mergeBlockReviewConfig({ blockMarker: "~!", revealSeparator: "~!" });
        expect(merged.revealSeparator).toEqual("---");
    });

    test("keeps a reveal separator that differs from the block marker", () => {
        const merged = mergeBlockReviewConfig({ blockMarker: "!!", revealSeparator: "~!" });
        expect(merged.revealSeparator).toEqual("~!");
    });

    test("defaults the reminder settings", () => {
        const merged = mergeBlockReviewConfig({});
        expect(merged.blockReviewRemindersEnabled).toEqual(false);
        expect(merged.blockReviewReminderIntervalMinutes).toEqual(5);
        expect(merged.blockReviewReminderNotify).toEqual(true);
        expect(merged.blockReviewReminderAutoOpen).toEqual(false);
        expect(merged.blockReviewReminderCheckOnStartup).toEqual(true);
    });

    test("round-trips reminder settings through serialize/parse", () => {
        const config = {
            ...DEFAULT_BLOCK_REVIEW_CONFIG,
            blockReviewRemindersEnabled: true,
            blockReviewReminderIntervalMinutes: 15,
            blockReviewReminderNotify: false,
            blockReviewReminderAutoOpen: true,
            blockReviewReminderCheckOnStartup: false,
        };
        const merged = mergeBlockReviewConfig(
            parseBlockReviewConfig(serializeBlockReviewConfig(config)),
        );
        expect(merged.blockReviewRemindersEnabled).toEqual(true);
        expect(merged.blockReviewReminderIntervalMinutes).toEqual(15);
        expect(merged.blockReviewReminderNotify).toEqual(false);
        expect(merged.blockReviewReminderAutoOpen).toEqual(true);
        expect(merged.blockReviewReminderCheckOnStartup).toEqual(false);
    });

    test("sanitizes a non-positive interval back to the default", () => {
        const merged = mergeBlockReviewConfig({
            blockReviewReminderIntervalMinutes: 0,
        });
        expect(merged.blockReviewReminderIntervalMinutes).toEqual(5);
    });

    test("floors a fractional interval to an integer", () => {
        const merged = mergeBlockReviewConfig({
            blockReviewReminderIntervalMinutes: 7.9,
        });
        expect(merged.blockReviewReminderIntervalMinutes).toEqual(7);
    });
});
