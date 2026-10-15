import moment from "moment";

import {
    blockInGroups,
    buildBlockReviewQueue,
    buildUpcomingBlockQueue,
    compareBlockDueDate,
    countDueBlocks,
    isBlockDue,
    isBlockUpcoming,
} from "src/block-review/block-review-queue";
import { BlockReviewItem } from "src/block-review/types";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { RepItemScheduleInfoOsr } from "src/scheduling/algorithms/osr/rep-item-schedule-info-osr";
import { setupStaticDateProvider20230906 } from "src/utils/dates";

function makeItem(id: string, dueDate: string | null, tags: string[] = []): BlockReviewItem {
    const schedule: RepItemScheduleInfo | null =
        dueDate === null ? null : new RepItemScheduleInfoOsr(moment(dueDate), 1, 250, 0);
    return {
        id,
        type: "recall",
        source: null,
        content: `content-${id}`,
        extra: null,
        schedule,
        notePath: "a.md",
        startLine: 0,
        endLine: 2,
        tags,
    };
}

describe("block review queue", () => {
    beforeEach(() => {
        setupStaticDateProvider20230906();
    });

    test("treats never-reviewed blocks as due", () => {
        expect(isBlockDue(makeItem("new", null))).toEqual(true);
    });

    test("treats past-due blocks as due and future blocks as not due", () => {
        expect(isBlockDue(makeItem("past", "2023-09-01"))).toEqual(true);
        expect(isBlockDue(makeItem("today", "2023-09-06"))).toEqual(true);
        expect(isBlockDue(makeItem("future", "2023-09-30"))).toEqual(false);
    });

    test("builds a queue of only due blocks ordered by due date then id", () => {
        const items = [
            makeItem("future", "2023-09-30"),
            makeItem("b", "2023-09-02"),
            makeItem("a", "2023-09-02"),
            makeItem("new", null),
        ];

        const queue = buildBlockReviewQueue(items);
        expect(queue.map((item) => item.id)).toEqual(["new", "a", "b"]);
    });

    test("does not mutate the input array", () => {
        const items = [makeItem("a", null), makeItem("b", null)];
        const snapshot = [...items];
        buildBlockReviewQueue(items);
        expect(items).toEqual(snapshot);
    });

    test("counts due blocks", () => {
        const items = [makeItem("a", null), makeItem("b", "2023-09-30"), makeItem("c", null)];
        expect(countDueBlocks(items)).toEqual(2);
    });

    test("compares due dates", () => {
        expect(
            compareBlockDueDate(makeItem("a", "2023-09-01"), makeItem("b", "2023-09-02")),
        ).toBeLessThan(0);
        expect(
            compareBlockDueDate(makeItem("a", "2023-09-02"), makeItem("b", "2023-09-01")),
        ).toBeGreaterThan(0);
    });

    test("an empty group list matches every block", () => {
        expect(blockInGroups(makeItem("a", null, []), [])).toEqual(true);
        expect(blockInGroups(makeItem("a", null, ["math"]), [])).toEqual(true);
    });

    test("matches a block that shares a group, normalizing names", () => {
        expect(blockInGroups(makeItem("a", null, ["math"]), ["#Math"])).toEqual(true);
        expect(blockInGroups(makeItem("a", null, ["arabic"]), ["math"])).toEqual(false);
    });

    test("filters the queue to the active groups", () => {
        const items = [
            makeItem("m1", null, ["math"]),
            makeItem("a1", null, ["arabic"]),
            makeItem("both", null, ["math", "arabic"]),
            makeItem("none", null, []),
        ];

        expect(buildBlockReviewQueue(items, ["math"]).map((item) => item.id)).toEqual([
            "both",
            "m1",
        ]);
        expect(buildBlockReviewQueue(items, ["arabic"]).map((item) => item.id)).toEqual([
            "a1",
            "both",
        ]);
        expect(buildBlockReviewQueue(items, []).map((item) => item.id)).toEqual([
            "a1",
            "both",
            "m1",
            "none",
        ]);
    });

    test("still excludes future blocks when filtering by group", () => {
        const items = [makeItem("due", null, ["math"]), makeItem("future", "2023-09-30", ["math"])];
        expect(buildBlockReviewQueue(items, ["math"]).map((item) => item.id)).toEqual(["due"]);
    });
});

describe("upcoming block queue", () => {
    beforeEach(() => {
        setupStaticDateProvider20230906();
    });

    test("treats only future-scheduled blocks as upcoming", () => {
        expect(isBlockUpcoming(makeItem("new", null))).toEqual(false);
        expect(isBlockUpcoming(makeItem("past", "2023-09-01"))).toEqual(false);
        expect(isBlockUpcoming(makeItem("today", "2023-09-06"))).toEqual(false);
        expect(isBlockUpcoming(makeItem("future", "2023-09-30"))).toEqual(true);
    });

    test("lists upcoming blocks soonest first", () => {
        const items = [
            makeItem("later", "2023-09-30"),
            makeItem("new", null),
            makeItem("due", "2023-09-01"),
            makeItem("sooner", "2023-09-10"),
        ];

        expect(buildUpcomingBlockQueue(items).map((item) => item.id)).toEqual(["sooner", "later"]);
    });

    test("filters upcoming blocks by active groups", () => {
        const items = [
            makeItem("m1", "2023-09-10", ["math"]),
            makeItem("a1", "2023-09-11", ["arabic"]),
        ];

        expect(buildUpcomingBlockQueue(items, ["math"]).map((item) => item.id)).toEqual(["m1"]);
    });

    test("does not mutate the input array", () => {
        const items = [makeItem("later", "2023-09-30"), makeItem("sooner", "2023-09-10")];
        const snapshot = [...items];
        buildUpcomingBlockQueue(items);
        expect(items).toEqual(snapshot);
    });
});
