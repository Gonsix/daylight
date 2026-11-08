import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, addIcon, parseYaml } from 'obsidian';
import { Dashboard } from './Dashboard';
import { DashboardStore } from './store';
import { validDay } from './model';
import { DASHBOARD_ICON, DASHBOARD_ICON_SVG } from './icon';

const VIEW_TYPE = 'vault-dashboard';
interface DashboardSettings { openOnStartup: boolean }
const DEFAULT_SETTINGS: DashboardSettings = { openOnStartup: false };

class DashboardSettingTab extends PluginSettingTab {
  constructor(private dashboard: VaultDashboardPlugin) { super(dashboard.app, dashboard); }
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('起動時にダッシュボードを開く')
      .setDesc('Obsidianの起動後、専用タブをホーム画面として表示します。開いているノートは保持します。HearthやHomepageの起動時表示はオフにしてください。')
      .addToggle(toggle => toggle.setValue(this.dashboard.settings.openOnStartup).onChange(async value => {
        const previous = this.dashboard.settings.openOnStartup;
        this.dashboard.settings.openOnStartup = value;
        try { await this.dashboard.saveSettings(); }
        catch (error) {
          this.dashboard.settings.openOnStartup = previous;
          toggle.setValue(previous);
          console.error('Vault Dashboard: 設定の保存に失敗しました。', error);
          new Notice('設定を保存できませんでした。もう一度お試しください。');
        }
      }));
  }
}
class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) { console.error('Vault Dashboard:', error); }
  render() { return this.state.error ? <p className="vd-error" role="alert">表示できませんでした。ビューを開き直してください。</p> : this.props.children; }
}
function render(root: Root, store: DashboardStore, date: string | null = null) {
  root.render(<Boundary><Dashboard store={store} initialDate={date} /></Boundary>);
}
class DashboardView extends ItemView {
  private root: Root | null = null;
  constructor(leaf: WorkspaceLeaf, private store: DashboardStore) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'ダッシュボード'; }
  getIcon() { return DASHBOARD_ICON; }
  async onOpen() {
    this.contentEl.empty(); this.contentEl.addClass('vd-host');
    this.root = createRoot(this.contentEl); render(this.root, this.store);
  }
  async onClose() { this.root?.unmount(); this.root = null; }
}
class DashboardEmbed extends MarkdownRenderChild {
  private root: Root | null = null;
  constructor(el: HTMLElement, private store: DashboardStore, private date: string | null) { super(el); }
  onload() { this.containerEl.addClass('vd-host', 'vd-embed'); this.root = createRoot(this.containerEl); render(this.root, this.store, this.date); }
  onunload() { this.root?.unmount(); this.root = null; }
}
export default class VaultDashboardPlugin extends Plugin {
  store!: DashboardStore;
  settings: DashboardSettings = { ...DEFAULT_SETTINGS };
  async onload() {
    addIcon(DASHBOARD_ICON, DASHBOARD_ICON_SVG);
    const saved = await this.loadData();
    this.settings = { openOnStartup: typeof saved?.openOnStartup === 'boolean' ? saved.openOnStartup : DEFAULT_SETTINGS.openOnStartup };
    this.addSettingTab(new DashboardSettingTab(this));
    this.store = new DashboardStore(this.app, this);
    this.registerView(VIEW_TYPE, leaf => new DashboardView(leaf, this.store));
    const open = async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      const leaf = existing ?? this.app.workspace.getLeaf('tab');
      if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    };
    this.addRibbonIcon('calendar-clock', 'ダッシュボード', () => void open());
    this.addCommand({ id: 'open-dashboard', name: 'ダッシュボードを開く', callback: () => void open() });
    let active = true;
    this.register(() => { active = false; });
    this.app.workspace.onLayoutReady(() => {
      if (active && this.settings.openOnStartup) {
        void open().catch(error => {
          console.error('Vault Dashboard: 起動時の表示に失敗しました。', error);
          new Notice('ダッシュボードを開けませんでした。コマンドから開き直してください。');
        });
      }
    });
    this.registerMarkdownCodeBlockProcessor('vault-dashboard', (source, el, ctx) => {
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
        ctx.addChild(new DashboardEmbed(el, this.store, date));
      } catch (e) { el.createEl('p', { cls: 'vd-error', text: (e as Error).message }); }
    });
  }
  async saveSettings() { await this.saveData(this.settings); }
}
