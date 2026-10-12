import { parseBlockSchedule, serializeBlockSchedule } from "src/block-review/block-schedule-record";
import { DEFAULT_SETTINGS } from "src/data/settings";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { SrsAlgorithmFsrs } from "src/scheduling/algorithms/fsrs/sr-algorithm-fsrs";
import { DueDateHistogram } from "src/scheduling/due-date-histogram";
import { setupStaticDateProvider20230906 } from "src/utils/dates";

describe("block schedule record", () => {
    beforeEach(() => {
        setupStaticDateProvider20230906();
    });

    function fsrsSchedule(): RepItemScheduleInfo {
        const algorithm = new SrsAlgorithmFsrs(DEFAULT_SETTINGS);
        return algorithm.cardGetNewSchedule(ReviewResponse.Good, "", new DueDateHistogram());
    }

    test("serializes to a single-line hidden comment", () => {
        const schedule = fsrsSchedule();
        const line = serializeBlockSchedule("r-1", schedule);
        expect(line.startsWith("%% sr-block ")).toEqual(true);
        expect(line.endsWith(" %%")).toEqual(true);
        expect(line.includes("\n")).toEqual(false);
    });

    test("round-trips an FSRS schedule", () => {
        const schedule = fsrsSchedule();
        const parsed = parseBlockSchedule(serializeBlockSchedule("r-1", schedule));

        expect(parsed).not.toBeNull();
        expect(parsed?.id).toEqual("r-1");
        expect(parsed?.schedule.algorithmType).toEqual(schedule.algorithmType);
        expect(parsed?.schedule.dueDateAsUnix).toEqual(schedule.dueDateAsUnix);
        expect(parsed?.schedule.serializeSchedule()).toEqual(schedule.serializeSchedule());
    });

    test("returns null for a line that is not a record", () => {
        expect(parseBlockSchedule("just some text")).toBeNull();
        expect(parseBlockSchedule("%% review :id=r-1 %%")).toBeNull();
    });

    test("returns null for a malformed json payload", () => {
        expect(parseBlockSchedule("%% sr-block {not json} %%")).toBeNull();
        expect(parseBlockSchedule("%% sr-block {} %%")).toBeNull();
    });

    test("returns null when the schedule payload is missing", () => {
        expect(parseBlockSchedule('%% sr-block {"version":1,"id":"r-1"} %%')).toBeNull();
    });
});
