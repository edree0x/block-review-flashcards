import { normalizeTag } from "src/block-review/block-review-parser";
import { BlockReviewItem } from "src/block-review/types";

/**
 * A block is due when it has never been reviewed or its scheduled due date has
 * passed.
 */
export function isBlockDue(item: BlockReviewItem): boolean {
    return item.schedule === null || item.schedule === undefined || item.schedule.isDue();
}

/**
 * Orders due blocks by due date (new blocks first) then by id for a stable,
 * deterministic queue.
 */
export function compareBlockDueDate(left: BlockReviewItem, right: BlockReviewItem): number {
    const leftDue = left.schedule ? left.schedule.dueDateAsUnix : Number.NEGATIVE_INFINITY;
    const rightDue = right.schedule ? right.schedule.dueDateAsUnix : Number.NEGATIVE_INFINITY;
    if (leftDue !== rightDue) {
        return leftDue - rightDue;
    }
    return left.id.localeCompare(right.id);
}

export function countDueBlocks(items: BlockReviewItem[]): number {
    return items.filter(isBlockDue).length;
}

/**
 * Whether a block belongs to any of the given groups. An empty group list means
 * every block matches (no filtering).
 */
export function blockInGroups(item: BlockReviewItem, activeGroups: string[]): boolean {
    if (activeGroups.length === 0) {
        return true;
    }
    const groups = activeGroups.map((group) => normalizeTag(group)).filter(Boolean);
    if (groups.length === 0) {
        return true;
    }
    return item.tags.some((tag) => groups.includes(normalizeTag(tag)));
}

/**
 * Filters to the due blocks and returns them in review order. When `activeGroups`
 * is non-empty only blocks in those groups are included. The input array is not
 * mutated.
 */
export function buildBlockReviewQueue(
    items: BlockReviewItem[],
    activeGroups: string[] = [],
): BlockReviewItem[] {
    return items
        .filter((item) => isBlockDue(item) && blockInGroups(item, activeGroups))
        .sort(compareBlockDueDate);
}
