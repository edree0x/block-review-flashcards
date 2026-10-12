import { BLOCK_SCHEDULE_RECORD_MARKER } from "src/block-review/block-review-parser";
import { ISerializedScheduleEntry } from "src/data/plugin-data";
import { RepItemScheduleFactory } from "src/scheduling/algorithms/base/rep-item-info-factory";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";

export const BLOCK_SCHEDULE_RECORD_VERSION = 1;

export interface BlockScheduleRecordPayload {
    version: number;
    id: string;
    schedule: ISerializedScheduleEntry;
}

export interface ParsedBlockSchedule {
    id: string;
    schedule: RepItemScheduleInfo;
}

/**
 * Serializes a block's schedule into a single-line hidden comment that is stored
 * inline in the note. Reusing the algorithm's own serialization keeps FSRS and
 * SM-2 round-tripping exactly the same as the rest of the plugin.
 */
export function serializeBlockSchedule(id: string, schedule: RepItemScheduleInfo): string {
    const payload: BlockScheduleRecordPayload = {
        version: BLOCK_SCHEDULE_RECORD_VERSION,
        id,
        schedule: schedule.serializeSchedule(),
    };
    return `%% sr-block ${JSON.stringify(payload)} %%`;
}

/**
 * Parses a single `%% sr-block {...} %%` line back into a schedule. Returns
 * `null` when the line is not a record or the payload cannot be read.
 */
export function parseBlockSchedule(line: string): ParsedBlockSchedule | null {
    const match = line.match(BLOCK_SCHEDULE_RECORD_MARKER);
    if (!match) {
        return null;
    }
    try {
        const payload = JSON.parse(match[1]) as Partial<BlockScheduleRecordPayload>;
        if (!payload.id || !payload.schedule) {
            return null;
        }
        return {
            id: payload.id,
            schedule: RepItemScheduleFactory.create(payload.schedule.algorithm, payload.schedule),
        };
    } catch {
        return null;
    }
}
