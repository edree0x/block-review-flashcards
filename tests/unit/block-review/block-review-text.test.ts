import {
    BLOCK_REVIEW_STATE_CLOSE,
    BLOCK_REVIEW_STATE_OPEN,
    pruneScheduleRecords,
    removeScheduleRecord,
    upsertScheduleRecord,
} from "src/block-review/block-review-text";

function record(id: string, interval = 3): string {
    return `%% sr-block {"version":1,"id":"${id}","schedule":{"algorithm":"SM-2-OSR","scheduleData":{"dueDate":"2025-01-01","interval":${interval},"ease":250,"delayedBeforeReviewTicks":0}}} %%`;
}

describe("upsertScheduleRecord", () => {
    test("creates a state region at the end of a note", () => {
        const text = "# Note\nbody\n";
        const result = upsertScheduleRecord(text, "b-1", record("b-1"));
        expect(result.split("\n")).toEqual([
            "# Note",
            "body",
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("replaces an existing record in place", () => {
        const text = [
            "body",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1", 3),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ].join("\n");
        const result = upsertScheduleRecord(text, "b-1", record("b-1", 9));
        expect(result.split("\n")).toEqual([
            "body",
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1", 9),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("appends a new record to an existing region", () => {
        const text = [BLOCK_REVIEW_STATE_OPEN, record("b-1"), BLOCK_REVIEW_STATE_CLOSE, ""].join(
            "\n",
        );
        const result = upsertScheduleRecord(text, "b-2", record("b-2"));
        expect(result.split("\n")).toEqual([
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            record("b-2"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("preserves CRLF line endings", () => {
        const text = "body\r\n";
        const result = upsertScheduleRecord(text, "b-1", record("b-1"));
        expect(result.includes("\r\n")).toEqual(true);
        expect(result.split("\r\n")).toEqual([
            "body",
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("repairs an unclosed region and drops non-record lines", () => {
        const text = [BLOCK_REVIEW_STATE_OPEN, "stray text", record("b-1")].join("\n");
        const result = upsertScheduleRecord(text, "b-2", record("b-2"));
        expect(result.split("\n")).toEqual([
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            record("b-2"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });
});

describe("removeScheduleRecord", () => {
    test("removes a record but keeps the region while others remain", () => {
        const text = [
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            record("b-2"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ].join("\n");
        const result = removeScheduleRecord(text, "b-1");
        expect(result.split("\n")).toEqual([
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-2"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("removes the whole region when the last record goes", () => {
        const text = [
            "body",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            BLOCK_REVIEW_STATE_CLOSE,
        ].join("\n");
        const result = removeScheduleRecord(text, "b-1");
        expect(result.split("\n")).toEqual(["body", ""]);
    });

    test("is a no-op when there is no region", () => {
        const text = "# Note\nbody";
        expect(removeScheduleRecord(text, "b-1")).toEqual(text);
    });
});

describe("pruneScheduleRecords", () => {
    test("keeps only records whose ids are valid", () => {
        const text = [
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            record("b-2"),
            record("b-3"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ].join("\n");
        const result = pruneScheduleRecords(text, new Set(["b-1", "b-3"]));
        expect(result.split("\n")).toEqual([
            "",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            record("b-3"),
            BLOCK_REVIEW_STATE_CLOSE,
            "",
        ]);
    });

    test("removes the region when nothing is valid", () => {
        const text = [
            "body",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            BLOCK_REVIEW_STATE_CLOSE,
        ].join("\n");
        expect(pruneScheduleRecords(text, new Set())).toEqual("body\n");
    });

    test("returns the text unchanged when there is no region or nothing to drop", () => {
        const noRegion = "# Note\nbody";
        expect(pruneScheduleRecords(noRegion, new Set(["b-1"]))).toEqual(noRegion);

        const text = [
            "body",
            BLOCK_REVIEW_STATE_OPEN,
            record("b-1"),
            BLOCK_REVIEW_STATE_CLOSE,
        ].join("\n");
        expect(pruneScheduleRecords(text, new Set(["b-1"]))).toEqual(text);
    });
});
