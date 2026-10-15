import {
    deriveBlockId,
    hashString,
    normalizeTag,
    parseNote,
    splitBlockContent,
} from "src/block-review/block-review-parser";

describe("normalizeTag", () => {
    test("strips a leading #, surrounding slashes and case", () => {
        expect(normalizeTag("#Review/Math")).toEqual("review/math");
        expect(normalizeTag("  math  ")).toEqual("math");
        expect(normalizeTag("/math/")).toEqual("math");
        expect(normalizeTag("##readwise")).toEqual("readwise");
    });
});

describe("hashString / deriveBlockId", () => {
    test("hashString is deterministic and base36", () => {
        expect(hashString("hello")).toEqual(hashString("hello"));
        expect(hashString("hello")).not.toEqual(hashString("world"));
    });

    test("deriveBlockId is stable for identical note path and content", () => {
        const first = deriveBlockId("a.md", "content");
        const second = deriveBlockId("a.md", "content");
        expect(first).toEqual(second);
        expect(first.startsWith("b-")).toEqual(true);
    });

    test("deriveBlockId changes when content changes", () => {
        expect(deriveBlockId("a.md", "content")).not.toEqual(deriveBlockId("a.md", "content2"));
    });
});

describe("splitBlockContent", () => {
    test("splits content and extra on the separator line", () => {
        const result = splitBlockContent("prompt line\n---\nanswer line");
        expect(result.content).toEqual("prompt line");
        expect(result.extra).toEqual("answer line");
    });

    test("returns no extra when there is no separator", () => {
        const result = splitBlockContent("just content");
        expect(result.content).toEqual("just content");
        expect(result.extra).toBeNull();
    });

    test("ignores separators inside the content that are not on their own line", () => {
        const result = splitBlockContent("a --- b\nc");
        expect(result.content).toEqual("a --- b\nc");
        expect(result.extra).toBeNull();
    });

    test("supports a custom separator", () => {
        const result = splitBlockContent("front\n===\nback", "===");
        expect(result.content).toEqual("front");
        expect(result.extra).toEqual("back");
    });

    test("trims the content and returns null for an empty reveal section", () => {
        const result = splitBlockContent("  prompt  \n---\n   ");
        expect(result.content).toEqual("prompt");
        expect(result.extra).toBeNull();
    });
});

describe("parseNote", () => {
    test("parses a single-line block as a recall card", () => {
        const note = ["# Heading", "~! Remember the Alamo", "plain line"].join("\n");
        const items = parseNote("a.md", note);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            type: "recall",
            source: null,
            content: "Remember the Alamo",
            extra: null,
            schedule: null,
            notePath: "a.md",
            startLine: 1,
            endLine: 1,
            tags: [],
        });
        expect(items[0].id).toEqual(deriveBlockId("a.md", "Remember the Alamo"));
    });

    test("requires a space after the marker for a single-line block", () => {
        expect(parseNote("a.md", "~!not a block")).toHaveLength(0);
    });

    test("parses a multi-line recall block", () => {
        const note = ["~!", "What is 2 + 2?", "!~"].join("\n");
        const items = parseNote("a.md", note);

        expect(items).toHaveLength(1);
        expect(items[0].type).toEqual("recall");
        expect(items[0].content).toEqual("What is 2 + 2?");
        expect(items[0].extra).toBeNull();
        expect(items[0].startLine).toEqual(0);
        expect(items[0].endLine).toEqual(2);
    });

    test("splits a multi-line block on the reveal separator into a flashcard", () => {
        const note = ["~!", "Capital of France?", "---", "Paris", "!~"].join("\n");
        const items = parseNote("a.md", note);

        expect(items).toHaveLength(1);
        expect(items[0].type).toEqual("flashcard");
        expect(items[0].content).toEqual("Capital of France?");
        expect(items[0].extra).toEqual("Paris");
    });

    test("does not split a single-line block on the separator", () => {
        const note = "~! front --- back";
        const items = parseNote("a.md", note);
        expect(items[0].type).toEqual("recall");
        expect(items[0].content).toEqual("front --- back");
        expect(items[0].extra).toBeNull();
    });

    test("ignores a multi-line block whose content is only a separator", () => {
        const note = ["~!", "---", "answer", "!~"].join("\n");
        expect(parseNote("a.md", note)).toHaveLength(0);
    });

    test("ignores an unclosed multi-line block", () => {
        const note = ["~!", "body with no close"].join("\n");
        expect(parseNote("a.md", note)).toHaveLength(0);
    });

    test("parses multiple blocks and trims their content", () => {
        const note = ["~! first", "", "~!", "  second  ", "!~"].join("\n");
        const items = parseNote("a.md", note);
        expect(items.map((item) => item.content)).toEqual(["first", "second"]);
    });

    test("applies the configured note groups to every block", () => {
        const note = ["~! one", "~! two"].join("\n");
        const items = parseNote("a.md", note, { noteGroups: ["#Readwise", "review/math", ""] });
        expect(items[0].tags).toEqual(["readwise", "review/math"]);
        expect(items[1].tags).toEqual(["readwise", "review/math"]);
    });

    test("supports custom markers", () => {
        const note = ["??", "custom body", "!!"].join("\n");
        const items = parseNote("a.md", note, { blockMarker: "??", blockEndMarker: "!!" });
        expect(items).toHaveLength(1);
        expect(items[0].content).toEqual("custom body");
    });

    test("treats a marker-with-text line as multi-line when a closer follows", () => {
        const note = ["~! Capital of France?", "---", "Paris", "!~"].join("\n");
        const items = parseNote("a.md", note);

        expect(items).toHaveLength(1);
        expect(items[0].type).toEqual("flashcard");
        expect(items[0].content).toEqual("Capital of France?");
        expect(items[0].extra).toEqual("Paris");
        expect(items[0].startLine).toEqual(0);
        expect(items[0].endLine).toEqual(3);
    });

    test("treats a marker-with-text line as multi-line recall when a closer follows", () => {
        const note = ["~! first line", "second line", "!~"].join("\n");
        const items = parseNote("a.md", note);

        expect(items).toHaveLength(1);
        expect(items[0].type).toEqual("recall");
        expect(items[0].content).toEqual("first line\nsecond line");
    });

    test("keeps a marker-with-text single-line when no closer follows", () => {
        const note = ["~! just one line", "plain text"].join("\n");
        const items = parseNote("a.md", note);
        expect(items).toHaveLength(1);
        expect(items[0].content).toEqual("just one line");
    });

    test("parses a single-line block followed by a multi-line block", () => {
        const note = ["~! quick", "~!", "long body line 1", "long body line 2", "!~"].join("\n");
        const items = parseNote("a.md", note);
        expect(items.map((item) => item.content)).toEqual([
            "quick",
            "long body line 1\nlong body line 2",
        ]);
    });

    test("does not close a block when a content line merely ends with the end marker", () => {
        const note = ["~!", "line one", "two !~", "line three", "!~"].join("\n");
        const items = parseNote("a.md", note);
        expect(items).toHaveLength(1);
        expect(items[0].content).toEqual("line one\ntwo !~\nline three");
    });

    test("allows the start and end markers to be the same string", () => {
        const note = ["??", "body line 1", "body line 2", "??"].join("\n");
        const items = parseNote("a.md", note, { blockMarker: "??", blockEndMarker: "??" });
        expect(items).toHaveLength(1);
        expect(items[0].content).toEqual("body line 1\nbody line 2");
    });

    test("attaches a schedule record found in the state region", () => {
        const id = deriveBlockId("a.md", "body");
        const scheduleRecord = `%% sr-block {"version":1,"id":"${id}","schedule":{"algorithm":"SM-2-OSR","scheduleData":{"dueDate":"2025-01-01","interval":3,"ease":250,"delayedBeforeReviewTicks":0}}} %%`;
        const note = [
            "~!",
            "body",
            "!~",
            "",
            "%% block-review-state %%",
            scheduleRecord,
            "%% /block-review-state %%",
        ].join("\n");

        const items = parseNote("a.md", note);
        expect(items).toHaveLength(1);
        expect(items[0].content).toEqual("body");
        expect(items[0].schedule).not.toBeNull();
        expect(items[0].schedule?.algorithmType).toEqual("SM-2-OSR");
    });

    test("strips schedule records from multi-line block content", () => {
        const record = '%% sr-block {"version":1,"id":"b-x","schedule":{}} %%';
        const note = ["~!", "body", record, "!~"].join("\n");
        const items = parseNote("a.md", note);
        expect(items[0].content).toEqual("body");
    });

    test("ignores a malformed schedule record", () => {
        const note = ["~! body", "%% sr-block {not json} %%"].join("\n");
        const items = parseNote("a.md", note);
        expect(items).toHaveLength(1);
        expect(items[0].schedule).toBeNull();
    });

    test("returns an empty array for a note without blocks", () => {
        expect(parseNote("a.md", "# Just a heading\nplain text")).toEqual([]);
    });
});
