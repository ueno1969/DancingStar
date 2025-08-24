import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { ProjectData, FileOperationResult, ProjectLoadResult, ProjectSettings } from './types/project';

/**
 * プロジェクトファイルの管理を行うクラス
 */
export class ProjectManager {
  private static readonly DEFAULT_SETTINGS: ProjectSettings = {
    canvasWidth: 160,
    canvasHeight: 100,
    defaultFrameRate: 60,
    backgroundColor: '#000000'
  };

  private static readonly FILE_FILTERS = [
    { name: 'Z80 Dancing Project', extensions: ['zdp'] },
    { name: 'JSON Files', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ];

  private currentFilePath: string | null = null;

  constructor(private mainWindow: BrowserWindow) {}

  /**
   * 新しいプロジェクトを作成
   */
  createNewProject(): ProjectData {
    const now = new Date().toISOString();
    // 新しいプロジェクトなので現在のファイルパスをクリア
    this.currentFilePath = null;
    return {
      name: 'Untitled Project',
      version: '1.0.0',
      images: [],
      sequences: [],
      settings: { ...ProjectManager.DEFAULT_SETTINGS },
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * プロジェクトを保存（上書き保存）
   */
  async saveProject(projectData: ProjectData): Promise<FileOperationResult> {
    try {
      let filePath = this.currentFilePath;

      // 現在のファイルパスがない場合は「名前をつけて保存」として処理
      if (!filePath) {
        return await this.saveAsProject(projectData);
      }

      // 更新日時を設定
      projectData.updatedAt = new Date().toISOString();

      const projectJson = JSON.stringify(projectData, null, 2);
      fs.writeFileSync(filePath, projectJson, 'utf8');
      
      return { 
        success: true, 
        filePath: filePath 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Save project error:', errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  /**
   * プロジェクトを名前をつけて保存
   */
  async saveAsProject(projectData: ProjectData): Promise<FileOperationResult> {
    try {
      const result = await dialog.showSaveDialog(this.mainWindow, {
        title: 'プロジェクトを保存',
        defaultPath: `${projectData.name || 'project'}.zdp`,
        filters: ProjectManager.FILE_FILTERS
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      // 更新日時を設定
      projectData.updatedAt = new Date().toISOString();

      const projectJson = JSON.stringify(projectData, null, 2);
      fs.writeFileSync(result.filePath, projectJson, 'utf8');
      
      // 現在のファイルパスを更新
      this.currentFilePath = result.filePath;
      
      return { 
        success: true, 
        filePath: result.filePath 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Save as project error:', errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  /**
   * プロジェクトを読み込み
   */
  async loadProject(): Promise<ProjectLoadResult> {
    try {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: 'プロジェクトを開く',
        filters: ProjectManager.FILE_FILTERS,
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const projectJson = fs.readFileSync(filePath, 'utf8');
      const projectData = JSON.parse(projectJson) as ProjectData;

      // データの妥当性チェック
      if (!this.validateProjectData(projectData)) {
        return { 
          success: false, 
          error: 'Invalid project file format' 
        };
      }

      // 現在のファイルパスを設定
      this.currentFilePath = filePath;

      return { 
        success: true, 
        data: projectData, 
        filePath 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Load project error:', errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  /**
   * プロジェクトデータの妥当性をチェック
   */
  private validateProjectData(data: any): data is ProjectData {
    return (
      data &&
      typeof data.name === 'string' &&
      typeof data.version === 'string' &&
      Array.isArray(data.images) &&
      Array.isArray(data.sequences) &&
      data.settings &&
      typeof data.settings.canvasWidth === 'number' &&
      typeof data.settings.canvasHeight === 'number'
    );
  }

  /**
   * 現在のプロジェクトファイルパスを取得
   */
  getCurrentFilePath(): string | null {
    return this.currentFilePath;
  }

  /**
   * エラーダイアログを表示
   */
  showError(title: string, message: string): void {
    dialog.showErrorBox(title, message);
  }
}
