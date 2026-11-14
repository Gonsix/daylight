import { isRecord, valueText } from './value';
import { DEFAULT_LANGUAGE, LANGUAGE_INFO, LANGUAGES, Language, parseLanguage, setLanguage, subscribeLanguage, t, translate } from './i18n';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemView, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, addIcon, parseYaml, requireApiVersion } from 'obsidian';
import { Daylight } from './Daylight';
import { DaylightStore } from './store';
import { validDay } from './model';
import { DAYLIGHT_ICON, DAYLIGHT_ICON_SVG } from './icon';
import { DEFAULT_ROOT, storageRoot } from './storage';

const timerHost = window;

const VIEW_TYPE = 'daylight';
interface DaylightSettings { openOnStartup: boolean; rootFolder: string; sortOrderGap: number; language: Language }
const DEFAULT_SETTINGS: DaylightSettings = { openOnStartup: false, rootFolder: DEFAULT_ROOT, sortOrderGap: 10000, language: DEFAULT_LANGUAGE };

class DaylightSettingTab extends PluginSettingTab {
  constructor(private dashboard: DaylightPlugin) { super(dashboard.app, dashboard); }
  getSettingDefinitions() {
    return [
      { name: translate(this.dashboard.settings.language, 'language'), desc: '', render: (setting: Setting) => this.renderLanguage(setting) },
      { name: t("Daylightフォルダの配置場所"), desc: t("Vault内の配置場所です。保存するとタスク・予定・プロジェクト・テンプレートをまとめて移動します。例: Daylight / etc/Daylight"), render: (setting: Setting) => this.renderRoot(setting) },
      { name: t("ソートオーダーの間隔"), desc: t("新規タスクや状態を変更したタスクを末尾に追加するときの間隔です。1以上の整数を指定してください。既存の順序は変更しません。"), render: (setting: Setting) => this.renderGap(setting) },
      { name: t("起動時にDaylightを開く"), desc: t("Obsidianの起動後、専用タブをホーム画面として表示します。開いているノートは保持します。HearthやHomepageの起動時表示はオフにしてください。"), render: (setting: Setting) => this.renderStartup(setting) },
    ];
  }
  // Obsidian versions before 1.13 still need the imperative renderer.
  display() {
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      definition.render(new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc));
    }
  }
  private refresh() {
    if (requireApiVersion('1.13.0')) this.update();
    else this.display();
  }
  private renderLanguage(setting: Setting) {
    const language = this.dashboard.settings.language;
    setting
      .addDropdown(dropdown => {
        // Build this plugin's list explicitly, even if the host supplied options.
        dropdown.selectEl.replaceChildren();
        dropdown.selectEl.setAttribute('data-daylight-setting', 'language');
        dropdown.selectEl.setAttribute('aria-label', `Daylight · ${translate(language, 'language')}`);
        for (const id of LANGUAGES) dropdown.addOption(id, LANGUAGE_INFO[id].name);
        dropdown.setValue(language).onChange(async value => {
          if (!LANGUAGES.includes(value as Language)) return;
          const previous = this.dashboard.settings.language;
          this.dashboard.settings.language = parseLanguage(value);
          try { await this.dashboard.saveSettings(); this.refresh(); }
          catch { this.dashboard.settings.language = previous; dropdown.setValue(previous); new Notice(t("設定を保存できませんでした。")); }
        });
      });
  }
  private renderRoot(setting: Setting) {
    let root = this.dashboard.settings.rootFolder;
    setting
      .addText(text => text.setPlaceholder('Daylight').setValue(root).onChange(value => {root=value;}))
      .addButton(button => button.setButtonText(t("保存して移動")).onClick(async () => {
        button.setDisabled(true);
        try {await this.dashboard.changeRootFolder(root);new Notice(t("Daylightフォルダの配置場所を保存しました。"));this.refresh();}
        catch(error) {new Notice((error as Error).message);}
        finally {button.setDisabled(false);}
      }));
  }
  private renderGap(setting: Setting) {
    let gap = String(this.dashboard.settings.sortOrderGap);
    setting
      .addText(text => text.setValue(gap).onChange(value => { gap = value; }))
      .addButton(button => button.setButtonText(t("保存")).onClick(async () => {
        const value = Number(gap);
        if (!/^\d+$/.test(gap.trim()) || !Number.isSafeInteger(value) || value < 1) { new Notice(t("間隔には1以上の整数を入力してください。")); return; }
        const previous = this.dashboard.settings.sortOrderGap;
        this.dashboard.settings.sortOrderGap = value;
        try { await this.dashboard.saveSettings(); new Notice(t("ソートオーダーの間隔を保存しました。")); }
        catch { this.dashboard.settings.sortOrderGap = previous; new Notice(t("設定を保存できませんでした。")); }
      }));
  }
  private renderStartup(setting: Setting) {
    setting
        .addToggle(toggle => toggle.setValue(this.dashboard.settings.openOnStartup).onChange(async value => {
          const previous = this.dashboard.settings.openOnStartup;
          this.dashboard.settings.openOnStartup = value;
          try { await this.dashboard.saveSettings(); }
          catch (error) {
            this.dashboard.settings.openOnStartup = previous; toggle.setValue(previous);
            console.error(t("Daylight: 設定の保存に失敗しました。"), error);
            new Notice(t("設定を保存できませんでした。もう一度お試しください。"));
          }
        }));
  }
}
class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  private stopLanguage: (() => void) | null = null;
  componentDidMount() { this.stopLanguage = subscribeLanguage(() => this.forceUpdate()); }
  componentWillUnmount() { this.stopLanguage?.(); }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) { console.error('Daylight:', error); }
  render() { return this.state.error ? <p className="daylight-error" role="alert">{t("表示できませんでした。ビューを開き直してください。")}</p> : this.props.children; }
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
  private openCommand: import('obsidian').Command | null = null;
  settings: DaylightSettings = { ...DEFAULT_SETTINGS };
  async onload() {
    addIcon(DAYLIGHT_ICON, DAYLIGHT_ICON_SVG);
    const rawSaved: unknown = await this.loadData();
    const saved = isRecord(rawSaved) ? rawSaved : {};
    this.settings = { openOnStartup: typeof saved?.openOnStartup === 'boolean' ? saved.openOnStartup : DEFAULT_SETTINGS.openOnStartup, rootFolder: typeof saved?.rootFolder === 'string' ? storageRoot(saved.rootFolder) : DEFAULT_ROOT, sortOrderGap: typeof saved.sortOrderGap === 'number' && Number.isSafeInteger(saved.sortOrderGap) && saved.sortOrderGap > 0 ? saved.sortOrderGap : 10000, language: parseLanguage(saved?.language) };
    if (saved && Object.hasOwn(saved,'enableKanban')) await this.saveData(this.settings);
    setLanguage(this.settings.language);
    this.addSettingTab(new DaylightSettingTab(this));
    this.store = new DaylightStore(this.app, this, this.settings.rootFolder);
    this.store.sortOrderGap = this.settings.sortOrderGap;
    this.store.language = this.settings.language;
    setLanguage(this.settings.language);
    this.registerView(VIEW_TYPE, leaf => new DaylightView(leaf, this.store));
    const open = async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      const leaf = existing ?? this.app.workspace.getLeaf('tab');
      if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    };
    this.addRibbonIcon(DAYLIGHT_ICON, 'Daylight', () => void open());
    this.openCommand = { id: 'open-daylight', name: t("ダッシュボードを開く"), callback: () => void open() };
    this.addCommand(this.openCommand);
    let active = true;
    let readyFrame = 0;
    this.register(() => {
      active = false;
      if (readyFrame && typeof cancelAnimationFrame === 'function') timerHost.cancelAnimationFrame(readyFrame);
    });
    const finishStartup = () => {
      if (!active) return;
      if (typeof requestAnimationFrame !== 'function') { this.store.markReady(); return; }
      readyFrame = timerHost.requestAnimationFrame(() => {
        if (!active) return;
        readyFrame = timerHost.requestAnimationFrame(() => {
          readyFrame = 0;
          if (active) this.store.markReady();
        });
      });
    };
    this.app.workspace.onLayoutReady(async () => {
      if (!active) return;
      // Vault files may not be available during onload. Register the view first
      // so Obsidian can restore it, then install folders once layout is ready.
      try {
        await this.store.storage.ensure();
      } catch (error) {
        console.error(t("Daylight: フォルダの初期化に失敗しました。"), error);
        if (active) new Notice(t("Daylightフォルダを準備できませんでした。設定の配置場所と書き込み権限を確認してください。"));
      }
      if (active) await this.store.prepareStartup();
      if (active && this.settings.openOnStartup) {
        await open().catch(error => {
          console.error(t("Daylight: 起動時の表示に失敗しました。"), error);
          new Notice(t("Daylightを開けませんでした。コマンドから開き直してください。"));
        });
      }
      finishStartup();
    });
    for (const language of ['vault-dashboard', 'daylight']) this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
      try {
        const parsed: unknown = source.trim() ? parseYaml(source) : {};
        const config = isRecord(parsed) ? parsed : {};
        const requested = config?.date;
        let date: string | null = null;
        if (requested === 'today') date = null;
        else if (requested !== undefined) {
          // The parser may return a Date for unquoted YAML dates.
          const raw = requested instanceof Date ? requested.toISOString().slice(0, 10) : valueText(requested);
          if (!validDay(raw)) throw new Error(t("日付は YYYY-MM-DD で指定してください。"));
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
    this.store.sortOrderGap = this.settings.sortOrderGap;
    this.store.language = this.settings.language;
    setLanguage(this.settings.language);
    if (this.openCommand) this.openCommand.name = t("ダッシュボードを開く");
    this.store.invalidate();
  }
  async changeRootFolder(value: string) {
    const next=storageRoot(value),previous=this.settings.rootFolder;
    if(next===previous)return;
    await this.store.relocateRoot(next,async()=>{
      this.settings.rootFolder=next;
      try {await this.saveSettings();}
      catch(error) {this.settings.rootFolder=previous;throw error;}
    });
  }
}
