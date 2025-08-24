import { contextBridge, ipcRenderer } from 'electron';
import { ProjectData, FileOperationResult, ProjectLoadResult } from './types/project';

// メインプロセスとの通信用API
contextBridge.exposeInMainWorld('electronAPI', {
  // システム情報
  getVersion: () => process.versions.electron,
  platform: process.platform,
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // プロジェクトファイル操作
  saveProject: (projectData: ProjectData): Promise<FileOperationResult> => 
    ipcRenderer.invoke('save-project', projectData),
  saveAsProject: (projectData: ProjectData): Promise<FileOperationResult> => 
    ipcRenderer.invoke('save-as-project', projectData),
  loadProject: (): Promise<ProjectLoadResult> => 
    ipcRenderer.invoke('load-project'),
  newProject: (): Promise<ProjectData> => 
    ipcRenderer.invoke('new-project'),
  
  // Undo/Redo操作
  undo: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('undo'),
  redo: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('redo'),
  
  // 自動保存関連
  startAutoSave: (projectData: ProjectData): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('start-autosave', projectData),
  stopAutoSave: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('stop-autosave'),
  hasAutoSave: (): Promise<boolean> =>
    ipcRenderer.invoke('has-autosave'),
  getAutoSaveInfo: (): Promise<{ exists: boolean; savedAt?: Date; size?: number }> =>
    ipcRenderer.invoke('get-autosave-info'),
  loadAutoSave: (): Promise<{ success: boolean; data?: ProjectData }> =>
    ipcRenderer.invoke('load-autosave'),
  clearAutoSave: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('clear-autosave'),
  saveAutoSaveNow: (projectData: ProjectData): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-autosave-now', projectData),
  // 設定関連
  getConfigValue: (key: string): Promise<any> =>
    ipcRenderer.invoke('get-config-value', key),
  
  // アプリ終了確認
  confirmQuit: (hasUnsavedChanges: boolean): Promise<{ allowQuit: boolean; shouldSave?: boolean }> =>
    ipcRenderer.invoke('confirm-quit', hasUnsavedChanges),
  
  // 現在のプロジェクトパスを取得
  getCurrentProjectPath: (): Promise<string | null> =>
    ipcRenderer.invoke('get-current-project-path'),
  
  // プロジェクトパス変更イベント
  onProjectPathChanged: (callback: (path: string | null) => void) => {
    ipcRenderer.on('project-path-changed', (_event, path) => callback(path));
  },
  
  // メニューイベントのリスナー
  onMenuAction: (callback: (action: string, data?: any) => void) => {
    ipcRenderer.on('menu-new-project', (_event, data) => callback('new-project', data));
    ipcRenderer.on('menu-save-project', () => callback('save-project'));
    ipcRenderer.on('menu-save-as-project', () => callback('save-as-project'));
    ipcRenderer.on('menu-load-project', (_event, data) => callback('load-project', data));
    ipcRenderer.on('restore-autosave', (_event, data) => callback('restore-autosave', data));
    ipcRenderer.on('menu-import-image', (_event, imagePath) => callback('import-image', imagePath));
    ipcRenderer.on('menu-export-z80', () => callback('export-z80'));
    ipcRenderer.on('menu-undo', () => callback('undo'));
    ipcRenderer.on('menu-redo', () => callback('redo'));
    ipcRenderer.on('perform-undo', () => callback('perform-undo'));
    ipcRenderer.on('perform-redo', () => callback('perform-redo'));
    ipcRenderer.on('frame-select-up', () => callback('frame-select-up'));
    ipcRenderer.on('frame-select-down', () => callback('frame-select-down'));
    ipcRenderer.on('frame-move-up', () => callback('frame-move-up'));
    ipcRenderer.on('frame-move-down', () => callback('frame-move-down'));
  },
  
  // ファイルシステム操作
  listImageFiles: (dirPath: string): Promise<string[]> =>
    ipcRenderer.invoke('list-image-files', dirPath),
  
  // ファイルダイアログ
  openFileDialog: (options: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('open-file-dialog', options),

  // 画像インポート関連
  showImportDialog: (imagePath: string): Promise<{ showSettings: boolean; imagePath?: string }> =>
    ipcRenderer.invoke('show-import-dialog', imagePath),
  splitAndSaveImage: (options: {
    imagePath: string;
    prefix: string;
    tileWidth: number;
    tileHeight: number;
  }): Promise<{ success: boolean; savedFiles?: string[]; totalFiles?: number; outputDir?: string; error?: string }> =>
    ipcRenderer.invoke('split-and-save-image', options),

  // Z80コードエクスポート
  exportZ80: (projectData: ProjectData): Promise<{ success: boolean; outputPath?: string; error?: string; canceled?: boolean; linesGenerated?: number; sizeBytes?: number }> =>
    ipcRenderer.invoke('export-z80-code', projectData),
  
  // セミグラフィック変換
  convertImageToSemiGraphic: (projectData: ProjectData, imageId: string): Promise<{ success: boolean; data?: any; stats?: any; error?: string }> =>
    ipcRenderer.invoke('convert-image-to-semi-graphic', projectData, imageId),
  convertImageFileToSemiGraphic: (imagePath: string): Promise<{ success: boolean; data?: any; stats?: any; error?: string }> =>
    ipcRenderer.invoke('convert-image-file-to-semi-graphic', imagePath),
  
  // リスナーの削除
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
