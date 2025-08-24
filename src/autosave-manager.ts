import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectData } from './types/project';

/**
 * 自動保存データの型定義
 */
interface AutoSaveData {
  projectData: ProjectData;
  projectPath: string | null;
  _autoSave: {
    savedAt: string;
    version: string;
  };
}

/**
 * 自動保存・自動ロード機能を管理するクラス
 */
export class AutoSaveManager {
  private static readonly AUTOSAVE_FILENAME = '.z80-dancing-editor-autosave.zdp';
  
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private autoSaveEnabled: boolean = true;
  private autoSaveInterval: number = 5000; // 5秒デフォルト（設定と統一）
  private lastSaveTime: Date | null = null;
  
  constructor(interval: number = 5000) {
    this.autoSaveInterval = interval;
  }

  /**
   * 自動保存ファイルのパスを取得
   */
  private getAutoSaveFilePath(): string {
    return path.join(os.homedir(), AutoSaveManager.AUTOSAVE_FILENAME);
  }

  /**
   * 自動保存を開始
   */
  startAutoSave(
    getProjectData: () => ProjectData | Promise<ProjectData>,
    getProjectPath?: () => string | null | Promise<string | null>
  ): void {
    if (!this.autoSaveEnabled) return;
    
    this.stopAutoSave(); // 既存のタイマーをクリア
    
    this.autoSaveTimer = setInterval(async () => {
      try {
        const projectData = await Promise.resolve(getProjectData());
        const projectPath = getProjectPath ? await Promise.resolve(getProjectPath()) : null;
        
        if (projectData) {
          await this.saveAutosave(projectData, projectPath);
          console.log('自動保存完了:', new Date().toLocaleTimeString());
        } else {
          console.log('プロジェクトデータが取得できませんでした');
        }
      } catch (error) {
        console.error('自動保存エラー:', error);
      }
    }, this.autoSaveInterval);
    
    console.log(`自動保存を開始しました (間隔: ${this.autoSaveInterval / 1000}秒)`);
  }

  /**
   * 自動保存を停止
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('自動保存を停止しました');
    }
  }

  /**
   * プロジェクトを自動保存
   */
  private async saveAutosave(projectData: ProjectData, projectPath: string | null = null): Promise<void> {
    try {
      const autoSaveFile = this.getAutoSaveFilePath();
      
      // メタデータとプロジェクトパスを追加
      const autoSaveData: AutoSaveData = {
        projectData,
        projectPath,
        _autoSave: {
          savedAt: new Date().toISOString(),
          version: '1.0.0'
        }
      };
      
      const projectJson = JSON.stringify(autoSaveData, null, 2);
      fs.writeFileSync(autoSaveFile, projectJson, 'utf8');
      
      this.lastSaveTime = new Date();
    } catch (error) {
      console.error('自動保存ファイル書き込みエラー:', error);
      throw error;
    }
  }

  /**
   * 自動保存ファイルが存在するかチェック
   */
  hasAutoSaveFile(): boolean {
    const autoSaveFile = this.getAutoSaveFilePath();
    return fs.existsSync(autoSaveFile);
  }

  /**
   * 自動保存ファイルの情報を取得
   */
  getAutoSaveInfo(): { exists: boolean; savedAt?: Date; size?: number } {
    const autoSaveFile = this.getAutoSaveFilePath();
    
    if (!fs.existsSync(autoSaveFile)) {
      return { exists: false };
    }
    
    try {
      const stats = fs.statSync(autoSaveFile);
      const data = JSON.parse(fs.readFileSync(autoSaveFile, 'utf8'));
      
      return {
        exists: true,
        savedAt: data._autoSave ? new Date(data._autoSave.savedAt) : new Date(stats.mtime),
        size: stats.size
      };
    } catch (error) {
      console.error('自動保存ファイル情報取得エラー:', error);
      return { exists: true };
    }
  }

  /**
   * 自動保存ファイルからプロジェクトを読み込み
   */
  async loadAutoSave(): Promise<{ projectData: ProjectData; projectPath: string | null } | null> {
    try {
      const autoSaveFile = this.getAutoSaveFilePath();
      
      if (!fs.existsSync(autoSaveFile)) {
        return null;
      }
      
      const jsonContent = fs.readFileSync(autoSaveFile, 'utf8');
      const data = JSON.parse(jsonContent);
      
      // 新しい形式（プロジェクトパス付き）かチェック
      if (data.projectData && data._autoSave) {
        // 新しい形式
        return {
          projectData: data.projectData as ProjectData,
          projectPath: data.projectPath || null
        };
      } else if (data._autoSave) {
        // 古い形式（プロジェクトデータが直接保存されている）
        const projectData = { ...data };
        delete projectData._autoSave;
        return {
          projectData: projectData as ProjectData,
          projectPath: null
        };
      } else {
        // 非常に古い形式
        return {
          projectData: data as ProjectData,
          projectPath: null
        };
      }
    } catch (error) {
      console.error('自動保存ファイル読み込みエラー:', error);
      return null;
    }
  }

  /**
   * 自動保存ファイルを削除
   */
  clearAutoSave(): void {
    try {
      const autoSaveFile = this.getAutoSaveFilePath();
      
      if (fs.existsSync(autoSaveFile)) {
        fs.unlinkSync(autoSaveFile);
        console.log('自動保存ファイルを削除しました');
      }
    } catch (error) {
      console.error('自動保存ファイル削除エラー:', error);
    }
  }

  /**
   * 自動保存の有効/無効を設定
   */
  setEnabled(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
    if (!enabled) {
      this.stopAutoSave();
    }
  }

  /**
   * 自動保存間隔を設定（ミリ秒）
   */
  setInterval(interval: number): void {
    this.autoSaveInterval = interval;
  }

  /**
   * 最後の自動保存時刻を取得
   */
  getLastSaveTime(): Date | null {
    return this.lastSaveTime;
  }

  /**
   * 手動で自動保存を実行
   */
  async saveNow(projectData: ProjectData, projectPath: string | null = null): Promise<void> {
    try {
      await this.saveAutosave(projectData, projectPath);
      console.log('手動自動保存完了:', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('手動自動保存エラー:', error);
      throw error;
    }
  }
}
