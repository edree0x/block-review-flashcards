import { Notice } from "obsidian";

import { BlockReviewManager } from "src/block-review/block-review-manager";
import { BlockReviewConfig } from "src/block-review/vault-config";

/**
 * Periodic background checker for due block-review blocks.
 *
 * Unlike the classic review-reminder loop (which watches the spaced-repetition
 * deck), this manager watches the block review queue specifically. When due
 * blocks are detected it surfaces an Obsidian toast and, when configured,
 * opens the block review panel.
 */
export class BlockReviewReminderManager {
    private readonly blockReviewManager: BlockReviewManager;

    private timer: number | null = null;
    private isChecking: boolean = false;

    constructor(blockReviewManager: BlockReviewManager) {
        this.blockReviewManager = blockReviewManager;
    }

    /** Start (or restart) the loop with the current config. */
    restart(): void {
        this.stop();
        const config = this.blockReviewManager.getConfig();
        if (!config.blockReviewRemindersEnabled) {
            return;
        }

        if (config.blockReviewReminderCheckOnStartup) {
            void this.check();
        }

        const intervalMinutes = Math.min(
            Math.max(config.blockReviewReminderIntervalMinutes, 1),
            1440,
        );
        this.timer = window.setInterval(
            () => {
                void this.check();
            },
            intervalMinutes * 60 * 1000,
        );
    }

    stop(): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
        this.isChecking = false;
    }

    private getConfig(): BlockReviewConfig {
        return this.blockReviewManager.getConfig();
    }

    private async check(): Promise<void> {
        const config = this.getConfig();
        if (!config.blockReviewRemindersEnabled) {
            return;
        }
        if (this.isChecking) {
            return;
        }
        // Don't fight the user's current context.
        if (this.isUserEditingText()) {
            return;
        }

        this.isChecking = true;
        try {
            const { due } = await this.blockReviewManager.getQueues();
            if (due.length <= 0) {
                return;
            }

            if (config.blockReviewReminderNotify) {
                this.notify(due.length);
            }

            if (config.blockReviewReminderAutoOpen) {
                await this.blockReviewManager.openView();
            }
        } catch {
            // Keep the loop alive even if a scan fails; a later check will retry.
        } finally {
            this.isChecking = false;
        }
    }

    private notify(count: number): void {
        const label =
            count === 1 ? "1 block is due for review" : `${count} blocks are due for review`;
        new Notice(`Block review: ${label}`, 6000);
    }

    private isUserEditingText(): boolean {
        const activeElement = activeDocument.activeElement;
        if (activeElement === null) {
            return false;
        }
        if (
            activeElement.instanceOf(HTMLTextAreaElement) ||
            activeElement.instanceOf(HTMLInputElement)
        ) {
            return true;
        }
        if (activeElement.instanceOf(HTMLElement)) {
            return (
                activeElement.isContentEditable ||
                activeElement.closest(".cm-editor, .markdown-source-view") !== null
            );
        }
        return false;
    }
}
