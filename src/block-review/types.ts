import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";

/**
 * The kind of review a block provides.
 *
 * - `recall`: the block content is always visible; an optional `extra` section is
 *   revealed on demand (like a note review).
 * - `flashcard`: the content is the prompt; the `extra` section is the answer and
 *   is hidden until revealed.
 */
export type BlockReviewType = "recall" | "flashcard";

/**
 * A single reviewable block parsed from a note.
 */
export interface BlockReviewItem {
    id: string;
    type: BlockReviewType;
    source: string | null;
    content: string;
    extra: string | null;
    schedule: RepItemScheduleInfo | null;
    notePath: string;
    /** Line index (0-based) of the opening marker. */
    startLine: number;
    /** Line index (0-based) of the closing marker (same as start for one-line blocks). */
    endLine: number;
    /**
     * Normalized groups attached to the block. Groups come from the note-level
     * review tags present on the note. An empty array means the block belongs to
     * no group.
     */
    tags: string[];
}

export type ReviewRating = "again" | "hard" | "good" | "easy";

export const BLOCK_REVIEW_DEFAULT_SEPARATOR = "---";
