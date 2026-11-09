import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, addIcon, parseYaml } from 'obsidian';
import { Daylight } from './Daylight';
import { DaylightStore } from './store';
import { validDay } from './model';
import { DAYLIGHT_ICON, DAYLIGHT_ICON_SVG } from './icon';

const VIEW_TYPE = 'daylight';
interface DaylightSettings { openOnStartup: boolean; enableKanban: boolean }
const DEFAULT_SETTINGS: DaylightSettings = { openOnStartup: false, enableKanban: false };

class DaylightSettingTab extends PluginSettingTab {
  constructor(private dashboard: DaylightPlugin) { super(dashboard.app, dashboard); }
  display() {
    this.containerEl.empty();
    for (const [key, name, desc] of [
      ['openOnStartup', '起動時にDaylightを開く', 'Obsidianの起動後、専用タブをホーム画面として表示します。開いているノートは保持します。HearthやHomepageの起動時表示はオフにしてください。'],
      ['enableKanban', 'カンバンビューを有効にする', 'タスクをカンバン形式で表示します。オフにするとリスト表示に戻ります。保留・中止の列は必要なときに開けます。'],
    ] as const) {
      new Setting(this.containerEl).setName(name).setDesc(desc)
        .addToggle(toggle => toggle.setValue(this.dashboard.settings[key]).onChange(async value => {
          const previous = this.dashboard.settings[key];
          this.dashboard.settings[key] = value;
          try { await this.dashboard.saveSettings(); }
          catch (error) {
            this.dashboard.settings[key] = previous; toggle.setValue(previous);
            console.error('Daylight: 設定の保存に失敗しました。', error);
            new Notice('設定を保存できませんでした。もう一度お試しください。');
          }
        }));
    }
  }
}
class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) { console.error('Daylight:', error); }
  render() { return this.state.error ? <p className="daylight-error" role="alert">表示できませんでした。ビューを開き直してください。</p> : this.props.children; }
}
function render(root: Root, store: DaylightStore, date: string | null = null) {
  root.render(<Boundary><Daylight store={store} initialDate={date} /></Boundary>);
}
class DaylightView extends ItemView {
  private root: Root | null = null;
  constructor(leaf: WorkspaceLeaf, private store: DaylightStore) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Daylight'; }
  getIcon() { return DAYLIGHT_ICON; }
  async onOpen() {
    this.contentEl.empty(); this.contentEl.addClass('daylight-host');
    this.root = createRoot(this.contentEl); render(this.root, this.store);
  }
  async onClose() { this.root?.unmount(); this.root = null; }
}
class DaylightEmbed extends MarkdownRenderChild {
  private root: Root | null = null;
  constructor(el: HTMLElement, private store: DaylightStore, private date: string | null) { super(el); }
  onload() { this.containerEl.addClass('daylight-host', 'daylight-embed'); this.root = createRoot(this.containerEl); render(this.root, this.store, this.date); }
  onunload() { this.root?.unmount(); this.root = null; }
}
export default class DaylightPlugin extends Plugin {
  store!: DaylightStore;
  settings: DaylightSettings = { ...DEFAULT_SETTINGS };
  async onload() {
    addIcon(DAYLIGHT_ICON, DAYLIGHT_ICON_SVG);
    const saved = await this.loadData();
    this.settings = { openOnStartup: typeof saved?.openOnStartup === 'boolean' ? saved.openOnStartup : DEFAULT_SETTINGS.openOnStartup, enableKanban: typeof saved?.enableKanban === 'boolean' ? saved.enableKanban : DEFAULT_SETTINGS.enableKanban };
    this.addSettingTab(new DaylightSettingTab(this));
    this.store = new DaylightStore(this.app, this);
    this.store.kanbanEnabled = this.settings.enableKanban;
    this.registerView(VIEW_TYPE, leaf => new DaylightView(leaf, this.store));
    const open = async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      const leaf = existing ?? this.app.workspace.getLeaf('tab');
      if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    };
    this.addRibbonIcon('calendar-clock', 'Daylight', () => void open());
    this.addCommand({ id: 'open-daylight', name: 'Daylightを開く', callback: () => void open() });
    let active = true;
    this.register(() => { active = false; });
    this.app.workspace.onLayoutReady(() => {
      if (active && this.settings.openOnStartup) {
        void open().catch(error => {
          console.error('Daylight: 起動時の表示に失敗しました。', error);
          new Notice('Daylightを開けませんでした。コマンドから開き直してください。');
        });
      }
    });
    for (const language of ['vault-dashboard', 'daylight']) this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
      try {
        const config = source.trim() ? parseYaml(source) : {};
        const requested = config?.date;
        let date: string | null = null;
        if (requested === 'today') date = null;
        else if (requested !== undefined) {
          // The parser may return a Date for unquoted YAML dates.
          const raw = requested instanceof Date ? requested.toISOString().slice(0, 10) : String(requested);
          if (!validDay(raw)) throw new Error('日付は YYYY-MM-DD で指定してください。');
          date = raw;
        } else {
          const daily = ctx.sourcePath.match(/^daily_notes\/01_daily\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1];
          date = daily && validDay(daily) ? daily : null;
        }
        ctx.addChild(new DaylightEmbed(el, this.store, date));
      } catch (e) { el.createEl('p', { cls: 'daylight-error', text: (e as Error).message }); }
    });
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.store.kanbanEnabled = this.settings.enableKanban;
    this.store.invalidate();
  }
}
