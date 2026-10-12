import { ReviewRating } from "src/block-review/types";
import { ISRAlgorithm, SRAlgorithmType } from "src/scheduling/algorithms/base/isr-algorithm";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { DueDateHistogram } from "src/scheduling/due-date-histogram";

/**
 * Maps a user-facing block rating to the plugin's internal review response.
 * Unknown ratings fall back to `Good` so a malformed click can never skip a card
 * forward on the easiest setting.
 */
export function ratingToReviewResponse(rating: ReviewRating): ReviewResponse {
    switch (rating) {
        case "again":
            return ReviewResponse.Again;
        case "hard":
            return ReviewResponse.Hard;
        case "easy":
            return ReviewResponse.Easy;
        case "good":
        default:
            return ReviewResponse.Good;
    }
}

/**
 * Thin adapter that turns a block review rating into the next schedule using the
 * plugin's active scheduling algorithm (FSRS by default, SM-2 optional). It
 * deliberately holds its own algorithm reference so pure logic stays testable
 * without the global {@link SRAlgorithm} singleton.
 */
export class BlockReviewScheduler {
    private readonly algorithm: ISRAlgorithm;
    private readonly histogram: DueDateHistogram;

    constructor(algorithm: ISRAlgorithm, histogram: DueDateHistogram = new DueDateHistogram()) {
        this.algorithm = algorithm;
        this.histogram = histogram;
    }

    get algorithmType(): SRAlgorithmType {
        return this.algorithm.algorithmType;
    }

    /**
     * Returns the next schedule for a block given the user's rating. A `null`
     * current schedule means the block is brand new.
     */
    calculateNext(
        response: ReviewResponse,
        currentSchedule: RepItemScheduleInfo | null,
    ): RepItemScheduleInfo {
        if (currentSchedule === null || currentSchedule === undefined) {
            return this.algorithm.cardGetNewSchedule(response, "", this.histogram);
        }
        return this.algorithm.cardCalcUpdatedSchedule(response, currentSchedule, this.histogram);
    }

    reset(): RepItemScheduleInfo {
        return this.algorithm.cardGetResetSchedule();
    }
}
