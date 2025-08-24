import { ProjectSettings } from './types/project';

/**
 * アプリケーション設定管理クラス
 */
export class ConfigManager {
  private static readonly DEFAULT_CONFIG = {
    canvasWidth: 160,
    canvasHeight: 100,
    defaultFrameRate: 60,
    backgroundColor: '#000000',
    maxRecentProjects: 10,
    autoSaveInterval: 5000, // 5秒
    zoomLevels: [0.5, 1, 2, 4, 8]
  };

  private config: typeof ConfigManager.DEFAULT_CONFIG;

  constructor() {
    this.config = { ...ConfigManager.DEFAULT_CONFIG };
    this.loadConfig();
  }

  /**
   * 設定を読み込み
   */
  private loadConfig(): void {
    try {
      const configPath = this.getConfigPath();
      if (require('fs').existsSync(configPath)) {
        const savedConfig = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }
  }

  /**
   * 設定を保存
   */
  saveConfig(): void {
    try {
      const configPath = this.getConfigPath();
      require('fs').writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * 設定ファイルのパスを取得
   */
  private getConfigPath(): string {
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), '.z80-dancing-editor-config.json');
  }

  /**
   * プロジェクト設定を取得
   */
  getProjectSettings(): ProjectSettings {
    return {
      canvasWidth: this.config.canvasWidth,
      canvasHeight: this.config.canvasHeight,
      defaultFrameRate: this.config.defaultFrameRate,
      backgroundColor: this.config.backgroundColor
    };
  }

  /**
   * 設定値を取得
   */
  get<K extends keyof typeof ConfigManager.DEFAULT_CONFIG>(key: K): typeof ConfigManager.DEFAULT_CONFIG[K] {
    return this.config[key];
  }

  /**
   * 設定値を更新
   */
  set<K extends keyof typeof ConfigManager.DEFAULT_CONFIG>(
    key: K, 
    value: typeof ConfigManager.DEFAULT_CONFIG[K]
  ): void {
    this.config[key] = value;
  }
}
