import { App, TFile, WorkspaceLeaf } from "obsidian";

import {
    buildBlockReviewQueue,
    buildUpcomingBlockQueue,
} from "src/block-review/block-review-queue";
import {
    BlockReviewScheduler,
    ratingToReviewResponse,
} from "src/block-review/block-review-scheduler";
import { BlockReviewService } from "src/block-review/block-review-service";
import { BlockReviewItem, ReviewRating } from "src/block-review/types";
import {
    BLOCK_REVIEW_CONFIG_FILE,
    BlockReviewConfig,
    DEFAULT_BLOCK_REVIEW_CONFIG,
    mergeBlockReviewConfig,
    parseBlockReviewConfig,
    serializeBlockReviewConfig,
} from "src/block-review/vault-config";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { SRAlgorithm } from "src/scheduling/algorithms/base/sr-algorithm";

export const BLOCK_REVIEW_VIEW_TYPE = "block-review-view";

/**
 * Coordinates the vault-backed config, the scheduler and the review view.
 *
 * Keeping this Obsidian-coupled (it is coverage-ignored) means the parser,
 * serializer, queue and scheduler modules remain pure and unit tested.
 */
export class BlockReviewManager {
    private readonly app: App;
    private readonly service: BlockReviewService;
    private config: BlockReviewConfig = { ...DEFAULT_BLOCK_REVIEW_CONFIG };
    private scheduler: BlockReviewScheduler | null = null;

    constructor(app: App) {
        this.app = app;
        this.service = new BlockReviewService(app, this.config);
    }

    /**
     * Loads `ReviewConfig.md` (creating it with defaults when missing) and wires
     * up a scheduler using the plugin's active algorithm.
     */
    async onLayoutReady(): Promise<void> {
        this.config = await this.loadConfig();
        this.service.updateConfig(this.config);

        try {
            this.scheduler = new BlockReviewScheduler(SRAlgorithm.getInstance());
        } catch {
            this.scheduler = null;
        }
    }

    getConfig(): BlockReviewConfig {
        return this.config;
    }

    isReady(): boolean {
        return this.scheduler !== null;
    }

    async updateConfig(partial: Partial<BlockReviewConfig>): Promise<void> {
        this.config = mergeBlockReviewConfig({ ...this.config, ...partial });
        this.service.updateConfig(this.config);
        await this.writeConfigFile();
    }

    async scan(): Promise<BlockReviewItem[]> {
        if (!this.config.enabled) {
            return [];
        }
        return this.service.scanVault();
    }

    /**
     * The due blocks the review view should walk through, already limited to the
     * configured active groups.
     */
    async getQueue(): Promise<BlockReviewItem[]> {
        return buildBlockReviewQueue(await this.scan(), this.config.activeGroups);
    }

    /**
     * Both the due queue the review session walks through and the upcoming,
     * already-scheduled blocks (soonest first), computed from a single vault
     * scan so a finished session can still show when its blocks come back.
     */
    async getQueues(): Promise<{ due: BlockReviewItem[]; upcoming: BlockReviewItem[] }> {
        const items = await this.scan();
        return {
            due: buildBlockReviewQueue(items, this.config.activeGroups),
            upcoming: buildUpcomingBlockQueue(items, this.config.activeGroups),
        };
    }

    /** Every distinct group (tag) currently used by a review block. */
    async listGroups(): Promise<string[]> {
        return this.service.listGroups();
    }

    async rate(item: BlockReviewItem, rating: ReviewRating): Promise<RepItemScheduleInfo | null> {
        if (this.scheduler === null) {
            return null;
        }
        const schedule = this.scheduler.calculateNext(
            ratingToReviewResponse(rating),
            item.schedule,
        );
        await this.service.applyReview(item, schedule);
        return schedule;
    }

    async openView(): Promise<void> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null =
            workspace.getLeavesOfType(BLOCK_REVIEW_VIEW_TYPE)[0] ?? null;
        if (leaf === null) {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: BLOCK_REVIEW_VIEW_TYPE, active: true });
        }
        await workspace.revealLeaf(leaf);
    }

    async openConfigFile(): Promise<void> {
        await this.ensureConfigFile();
        const file = this.app.vault.getAbstractFileByPath(BLOCK_REVIEW_CONFIG_FILE);
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(true).openFile(file);
        }
    }

    private async loadConfig(): Promise<BlockReviewConfig> {
        const file = this.app.vault.getAbstractFileByPath(BLOCK_REVIEW_CONFIG_FILE);
        if (file instanceof TFile) {
            const text = await this.app.vault.read(file);
            return mergeBlockReviewConfig(parseBlockReviewConfig(text));
        }

        const config = { ...DEFAULT_BLOCK_REVIEW_CONFIG };
        await this.app.vault.create(BLOCK_REVIEW_CONFIG_FILE, serializeBlockReviewConfig(config));
        return config;
    }

    private async ensureConfigFile(): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(BLOCK_REVIEW_CONFIG_FILE);
        if (!(file instanceof TFile)) {
            await this.app.vault.create(
                BLOCK_REVIEW_CONFIG_FILE,
                serializeBlockReviewConfig(this.config),
            );
        }
    }

    private async writeConfigFile(): Promise<void> {
        const contents = serializeBlockReviewConfig(this.config);
        const file = this.app.vault.getAbstractFileByPath(BLOCK_REVIEW_CONFIG_FILE);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, contents);
        } else {
            await this.app.vault.create(BLOCK_REVIEW_CONFIG_FILE, contents);
        }
    }
}
