import {
    BlockReviewScheduler,
    ratingToReviewResponse,
} from "src/block-review/block-review-scheduler";
import { DEFAULT_SETTINGS } from "src/data/settings";
import { SRAlgorithmType } from "src/scheduling/algorithms/base/isr-algorithm";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { SrsAlgorithmFsrs } from "src/scheduling/algorithms/fsrs/sr-algorithm-fsrs";
import { SRAlgorithmOsr } from "src/scheduling/algorithms/osr/srs-algorithm-osr";
import { setupStaticDateProvider20230906 } from "src/utils/dates";

describe("BlockReviewScheduler", () => {
    beforeEach(() => {
        setupStaticDateProvider20230906();
    });

    test("uses the FSRS algorithm and schedules a new block", () => {
        const scheduler = new BlockReviewScheduler(new SrsAlgorithmFsrs(DEFAULT_SETTINGS));
        expect(scheduler.algorithmType).toEqual(SRAlgorithmType.FSRS);

        const schedule = scheduler.calculateNext(ReviewResponse.Good, null);
        expect(schedule.algorithmType).toEqual(SRAlgorithmType.FSRS);
        expect(schedule.dueDateAsUnix).toBeGreaterThan(0);
    });

    test("reschedules an existing FSRS block further out after a Good rating", () => {
        const scheduler = new BlockReviewScheduler(new SrsAlgorithmFsrs(DEFAULT_SETTINGS));
        const first = scheduler.calculateNext(ReviewResponse.Good, null);
        const second = scheduler.calculateNext(ReviewResponse.Good, first);
        expect(second.dueDateAsUnix).toBeGreaterThanOrEqual(first.dueDateAsUnix);
    });

    test("works with the SM-2 algorithm", () => {
        const scheduler = new BlockReviewScheduler(new SRAlgorithmOsr(DEFAULT_SETTINGS));
        expect(scheduler.algorithmType).toEqual(SRAlgorithmType.SM_2_OSR);

        const first = scheduler.calculateNext(ReviewResponse.Good, null);
        expect(first.interval).toEqual(3);

        const second = scheduler.calculateNext(ReviewResponse.Good, first);
        expect(second.interval).toBeGreaterThan(first.interval);
    });

    test("returns a reset schedule starting at the initial interval", () => {
        const scheduler = new BlockReviewScheduler(new SRAlgorithmOsr(DEFAULT_SETTINGS));
        expect(scheduler.reset().interval).toEqual(1.0);
    });
});

describe("ratingToReviewResponse", () => {
    test("maps every supported rating", () => {
        expect(ratingToReviewResponse("again")).toEqual(ReviewResponse.Again);
        expect(ratingToReviewResponse("hard")).toEqual(ReviewResponse.Hard);
        expect(ratingToReviewResponse("good")).toEqual(ReviewResponse.Good);
        expect(ratingToReviewResponse("easy")).toEqual(ReviewResponse.Easy);
    });

    test("falls back to Good for an unknown rating", () => {
        expect(ratingToReviewResponse("nonsense" as never)).toEqual(ReviewResponse.Good);
    });
});
