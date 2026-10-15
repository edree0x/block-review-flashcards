import "src/ui/obsidian-ui-components/block-review/block-review-view.css";
import { debounce, ItemView, MarkdownRenderer, setIcon, WorkspaceLeaf } from "obsidian";

import { BLOCK_REVIEW_VIEW_TYPE, BlockReviewManager } from "src/block-review/block-review-manager";
import { BlockReviewItem, ReviewRating } from "src/block-review/types";
import { globalDateProvider } from "src/utils/dates";

/** How many days relative to today a "due" label mentions before falling back to a date. */
const MAX_RELATIVE_DUE_DAYS = 14;

function previewText(content: string): string {
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? content;
    const trimmed = firstLine.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

interface RatingOption {
    rating: ReviewRating;
    label: string;
    className: string;
}

const RATING_OPTIONS: RatingOption[] = [
    { rating: "again", label: "Again", className: "mod-again" },
    { rating: "hard", label: "Hard", className: "mod-hard" },
    { rating: "good", label: "Good", className: "mod-good" },
    { rating: "easy", label: "Easy", className: "mod-easy" },
];

/**
 * Sidebar view that walks the user through every due block in the vault.
 *
 * Uses plain DOM (no framework) so it behaves consistently on desktop and
 * mobile.
 */
export class BlockReviewView extends ItemView {
    private readonly manager: BlockReviewManager;
    private queue: BlockReviewItem[] = [];
    private upcoming: BlockReviewItem[] = [];
    private index = 0;
    private revealed = false;

    /**
     * Refreshes the view when the vault changes so the list stays accurate
     * without a manual refresh. It never interrupts an in-progress session.
     */
    private readonly scheduleRefresh = debounce(
        () => {
            if (!this.sessionActive) {
                void this.reload();
            }
        },
        800,
        true,
    );

    constructor(leaf: WorkspaceLeaf, manager: BlockReviewManager) {
        super(leaf);
        this.manager = manager;
    }

    /** Whether a card is currently on screen (a rating would advance it). */
    private get sessionActive(): boolean {
        return this.queue.length > 0 && this.index < this.queue.length;
    }

    getViewType(): string {
        return BLOCK_REVIEW_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Block Review";
    }

    getIcon(): string {
        return "layers";
    }

    async onOpen(): Promise<void> {
        this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
        this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
        this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
        this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
        this.register(() => this.scheduleRefresh.cancel());
        await this.reload();
    }

    private async reload(): Promise<void> {
        try {
            const { due, upcoming } = await this.manager.getQueues();
            this.queue = due;
            this.upcoming = upcoming;
        } catch {
            this.queue = [];
            this.upcoming = [];
        }
        this.index = 0;
        this.revealed = false;
        this.render();
    }

    private render(): void {
        const root = this.contentEl;
        root.empty();
        root.addClass("block-review-view");

        this.renderHeader(root);

        if (!this.manager.isReady()) {
            this.renderMessage(
                root,
                "info",
                "The scheduling algorithm is still loading. Try Refresh in a moment.",
            );
            return;
        }

        if (this.sessionActive) {
            this.renderCard(root, this.queue[this.index]);
            return;
        }

        if (this.queue.length === 0) {
            this.renderMessage(root, "check-circle", "No blocks are due right now.");
        } else {
            this.renderSummary(root);
        }

        this.renderUpcoming(root, this.upcoming);
    }

    private renderHeader(root: HTMLElement): void {
        const header = root.createDiv("block-review-header");

        const title = header.createDiv("block-review-title");
        const icon = title.createDiv("block-review-title-icon");
        setIcon(icon, "layers");
        title.createSpan({ text: "Block Review" });

        const actions = header.createDiv("block-review-actions");

        const activeGroups = this.manager.getConfig().activeGroups;
        actions.createSpan({
            cls: "block-review-groups",
            text: activeGroups.length > 0 ? `Groups: ${activeGroups.join(", ")}` : "Groups: all",
        });

        if (this.queue.length > 0 && this.index < this.queue.length) {
            actions.createSpan({
                cls: "block-review-progress",
                text: `${this.index + 1} / ${this.queue.length}`,
            });
        }

        const refreshButton = actions.createEl("button", {
            cls: "clickable-icon",
            attr: { "aria-label": "Refresh block review" },
        });
        setIcon(refreshButton, "refresh-cw");
        refreshButton.addEventListener("click", () => {
            void this.reload();
        });
    }

    private renderMessage(root: HTMLElement, iconName: string, text: string): void {
        const message = root.createDiv("block-review-message");
        const icon = message.createDiv("block-review-message-icon");
        setIcon(icon, iconName);
        message.createDiv({ text });
    }

    private renderSummary(root: HTMLElement): void {
        const summary = root.createDiv("block-review-message");
        const icon = summary.createDiv("block-review-message-icon");
        setIcon(icon, "check-circle");
        summary.createDiv({ text: "All due blocks reviewed." });

        const again = summary.createEl("button", { text: "Review again", cls: "mod-cta" });
        again.addEventListener("click", () => {
            void this.reload();
        });
    }

    private renderCard(root: HTMLElement, item: BlockReviewItem): void {
        const card = root.createDiv("block-review-card");

        const meta = card.createDiv("block-review-meta");
        meta.createSpan({
            cls: "block-review-badge",
            text: item.type === "flashcard" ? "Flashcard" : "Recall",
        });
        const sourceLink = meta.createEl("a", {
            cls: "block-review-source",
            text: item.source ?? item.notePath,
        });
        sourceLink.addEventListener("click", (event) => {
            event.preventDefault();
            this.openSource(item);
        });

        const contentEl = card.createDiv("block-review-content markdown-rendered");
        void this.renderMarkdown(contentEl, item.content, item.notePath);

        const extraEl = card.createDiv("block-review-extra markdown-rendered");
        if (this.revealed && item.extra) {
            extraEl.addClass("is-visible");
            void this.renderMarkdown(extraEl, item.extra, item.notePath);
        } else {
            extraEl.setCssProps({ display: "none" });
        }

        const controls = card.createDiv("block-review-controls");
        if (!this.revealed && item.extra) {
            const showButton = controls.createEl("button", {
                cls: "mod-cta block-review-show",
                text: item.type === "flashcard" ? "Show answer" : "Show notes",
            });
            showButton.addEventListener("click", () => {
                this.revealed = true;
                this.render();
            });
            return;
        }

        for (const option of RATING_OPTIONS) {
            const button = controls.createEl("button", {
                cls: `block-review-rate ${option.className}`,
                text: option.label,
            });
            button.addEventListener("click", () => {
                void this.rate(option.rating);
            });
        }
    }

    private async rate(rating: ReviewRating): Promise<void> {
        const item = this.queue[this.index];
        try {
            await this.manager.rate(item, rating);
        } catch {
            // Keep the session going even if the write fails; a refresh will sync.
        }

        if (this.manager.getConfig().autoAdvance) {
            this.index += 1;
        }
        this.revealed = false;

        if (this.index >= this.queue.length) {
            // The session just finished: rescan so the reviewed blocks show up
            // under "Upcoming" with their next due dates instead of vanishing.
            await this.reload();
        } else {
            this.render();
        }
    }

    private reviewNow(item: BlockReviewItem): void {
        this.queue = [item];
        this.upcoming = this.upcoming.filter((candidate) => candidate.id !== item.id);
        this.index = 0;
        this.revealed = false;
        this.render();
    }

    private dueLabel(item: BlockReviewItem): string {
        if (item.schedule === null) {
            return "New";
        }
        const formatted = item.schedule.formatDueDate();
        const days = item.schedule.dueDate
            .clone()
            .startOf("day")
            .diff(globalDateProvider.now.clone().startOf("day"), "days");
        if (days <= 0) {
            return `due ${formatted}`;
        }
        if (days === 1) {
            return `due ${formatted} (tomorrow)`;
        }
        if (days <= MAX_RELATIVE_DUE_DAYS) {
            return `due ${formatted} (in ${days} days)`;
        }
        return `due ${formatted}`;
    }

    private renderUpcoming(root: HTMLElement, items: BlockReviewItem[]): void {
        if (items.length === 0) {
            return;
        }

        const section = root.createDiv("block-review-upcoming");
        const header = section.createDiv("block-review-upcoming-header");
        header.createSpan({ cls: "block-review-upcoming-title", text: "Upcoming" });
        header.createSpan({
            cls: "block-review-upcoming-count",
            text: `${items.length}`,
        });

        const list = section.createDiv("block-review-upcoming-list");
        for (const item of items) {
            const row = list.createDiv("block-review-upcoming-item");

            row.createSpan({
                cls: "block-review-badge block-review-upcoming-badge",
                text: item.type === "flashcard" ? "Flashcard" : "Recall",
            });

            const body = row.createDiv("block-review-upcoming-body");
            const sourceLink = body.createEl("a", {
                cls: "block-review-source",
                text: item.source ?? item.notePath,
            });
            sourceLink.addEventListener("click", (event) => {
                event.preventDefault();
                this.openSource(item);
            });
            body.createDiv({
                cls: "block-review-upcoming-preview",
                text: previewText(item.content),
            });

            const side = row.createDiv("block-review-upcoming-side");
            side.createSpan({ cls: "block-review-due", text: this.dueLabel(item) });
            const reviewNowButton = side.createEl("button", {
                cls: "block-review-review-now",
                text: "Review now",
            });
            reviewNowButton.addEventListener("click", () => {
                this.reviewNow(item);
            });
        }
    }

    private openSource(item: BlockReviewItem): void {
        const raw = item.source ?? item.notePath;
        const linktext = raw.replace(/^\[\[/, "").replace(/\]\]$/, "");
        void this.app.workspace.openLinkText(linktext, "", false);
    }

    private async renderMarkdown(
        el: HTMLElement,
        markdown: string,
        sourcePath: string,
    ): Promise<void> {
        el.empty();
        await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
    }
}
