import { ButtonComponent, Setting, SettingGroup } from "obsidian";

import { normalizeTag } from "src/block-review/block-review-parser";
import { BLOCK_REVIEW_CONFIG_FILE } from "src/block-review/vault-config";
import { DataManager } from "src/data/data-manager";
import { SettingsManager } from "src/data/settings-manager";
import SRPlugin from "src/main";
import { SettingsPage } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page";
import { SettingsPageType } from "src/ui/obsidian-ui-components/content-container/settings-page/settings-page-manager";

/**
 * Settings page for the vault-backed block review feature.
 *
 * Strings are intentionally plain English literals: this is a personal fork and
 * the wording is expected to change before any translation work begins.
 */
export class BlockReviewPage extends SettingsPage {
    private groupsContainerEl: HTMLElement;

    constructor(
        pageContainerEl: HTMLElement,
        plugin: SRPlugin,
        settingsManager: SettingsManager,
        dataManager: DataManager,
        pageType: SettingsPageType,
        applySettingsUpdate: (callback: () => unknown) => void,
        display: () => void,
        openPage: (pageType: SettingsPageType) => void,
        scrollListener: (scrollPosition: number) => void,
    ) {
        super(
            pageContainerEl,
            plugin,
            settingsManager,
            dataManager,
            pageType,
            applySettingsUpdate,
            display,
            openPage,
            scrollListener,
        );

        new SettingGroup(this.containerEl)
            .setHeading("General")
            .addSetting((setting: Setting) => {
                setting
                    .setName("Enable block review")
                    .setDesc("Scan notes for review blocks and include them in the queue.")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.blockReviewManager.getConfig().enabled)
                            .onChange(async (value) => {
                                await plugin.blockReviewManager.updateConfig({ enabled: value });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Auto advance")
                    .setDesc("Jump to the next due block automatically after rating.")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.blockReviewManager.getConfig().autoAdvance)
                            .onChange(async (value) => {
                                await plugin.blockReviewManager.updateConfig({
                                    autoAdvance: value,
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Reveal separator")
                    .setDesc("The line that separates the visible content from the reveal section.")
                    .addText((text) =>
                        text
                            .setPlaceholder("---")
                            .setValue(plugin.blockReviewManager.getConfig().revealSeparator)
                            .onChange((value) => {
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        revealSeparator: value,
                                    });
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Block start marker")
                    .setDesc(
                        "Starts a block. `~! text` is a single-line block when nothing closes it; if a `!~` closing line follows, `~! text` starts a multi-line block and `text` becomes its first line. A line that is just `~!` always opens a multi-line block.",
                    )
                    .addText((text) =>
                        text
                            .setPlaceholder("~!")
                            .setValue(plugin.blockReviewManager.getConfig().blockMarker)
                            .onChange((value) => {
                                if (value.trim().length === 0) {
                                    return;
                                }
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        blockMarker: value.trim(),
                                    });
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Block end marker")
                    .setDesc("Closes a multi-line block.")
                    .addText((text) =>
                        text
                            .setPlaceholder("!~")
                            .setValue(plugin.blockReviewManager.getConfig().blockEndMarker)
                            .onChange((value) => {
                                if (value.trim().length === 0) {
                                    return;
                                }
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        blockEndMarker: value.trim(),
                                    });
                                });
                            }),
                    );
            });

        new SettingGroup(this.containerEl)
            .setHeading("Marking")
            .addSetting((setting: Setting) => {
                setting
                    .setName("Review tags")
                    .setDesc(
                        "Note-level tags. Any note carrying one of these tags (in the body or frontmatter) is scanned, and the tags become each block's group. Example: #readwise",
                    )
                    .addTextArea((text) =>
                        text
                            .setValue(plugin.blockReviewManager.getConfig().reviewTags.join(" "))
                            .onChange((value) => {
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        reviewTags: value.split(/\s+/).filter((entry) => entry),
                                    });
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Ignored folders")
                    .setDesc("One folder per line. Review blocks inside them are skipped.")
                    .addTextArea((text) =>
                        text
                            .setValue(
                                plugin.blockReviewManager.getConfig().ignoredFolders.join("\n"),
                            )
                            .onChange((value) => {
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        ignoredFolders: value
                                            .split(/\n+/)
                                            .map((entry) => entry.trim())
                                            .filter((entry) => entry),
                                    });
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Ignored files")
                    .setDesc("One file path per line. Review blocks inside them are skipped.")
                    .addTextArea((text) =>
                        text
                            .setValue(plugin.blockReviewManager.getConfig().ignoredFiles.join("\n"))
                            .onChange((value) => {
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        ignoredFiles: value
                                            .split(/\n+/)
                                            .map((entry) => entry.trim())
                                            .filter((entry) => entry),
                                    });
                                });
                            }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Ignored tags")
                    .setDesc("Notes carrying any of these tags are skipped entirely.")
                    .addTextArea((text) =>
                        text
                            .setValue(plugin.blockReviewManager.getConfig().ignoredTags.join(" "))
                            .onChange((value) => {
                                applySettingsUpdate(async () => {
                                    await plugin.blockReviewManager.updateConfig({
                                        ignoredTags: value.split(/\s+/).filter((entry) => entry),
                                    });
                                });
                            }),
                    );
            });

        const groupsGroup = new SettingGroup(this.containerEl).setHeading("Groups");
        groupsGroup.addSetting((setting: Setting) => {
            setting
                .setName("Review groups")
                .setDesc("Tick the groups to review. Leave all unticked to review every group.")
                .addButton((button: ButtonComponent) =>
                    button.setButtonText("Refresh groups").onClick(() => {
                        void this.renderGroups();
                    }),
                );
        });
        this.groupsContainerEl = groupsGroup.listEl.createDiv("block-review-groups-list");

        new SettingGroup(this.containerEl)
            .setHeading("Actions")
            .addSetting((setting: Setting) => {
                setting
                    .setName("Open block review")
                    .setDesc("Start reviewing the due blocks now.")
                    .addButton((button: ButtonComponent) =>
                        button.setButtonText("Open").onClick(() => {
                            void plugin.blockReviewManager.openView();
                        }),
                    );
            })
            .addSetting((setting: Setting) => {
                setting
                    .setName("Settings file")
                    .setDesc(`Edit ${BLOCK_REVIEW_CONFIG_FILE} directly.`)
                    .addButton((button: ButtonComponent) =>
                        button.setButtonText("Open file").onClick(() => {
                            void plugin.blockReviewManager.openConfigFile();
                        }),
                    );
            });

        void this.renderGroups();
    }

    private async renderGroups(): Promise<void> {
        const container = this.groupsContainerEl;
        container.empty();

        let groups: string[];
        try {
            groups = await this.plugin.blockReviewManager.listGroups();
        } catch {
            groups = [];
        }

        if (groups.length === 0) {
            container.createDiv({
                cls: "setting-item-description",
                text: "No review blocks found yet. Tag a note at the note level and add a ~! block.",
            });
            return;
        }

        for (const group of groups) {
            new Setting(container).setName(group).addToggle((toggle) => {
                const activeGroups = this.plugin.blockReviewManager.getConfig().activeGroups;
                const active = activeGroups.map((entry) => normalizeTag(entry));
                toggle.setValue(active.includes(group)).onChange(async (value) => {
                    const current = this.plugin.blockReviewManager
                        .getConfig()
                        .activeGroups.map((entry) => normalizeTag(entry));
                    const next = value
                        ? [...new Set([...current, group])]
                        : current.filter((entry) => entry !== group);
                    await this.plugin.blockReviewManager.updateConfig({
                        activeGroups: next,
                    });
                });
            });
        }
    }
}
