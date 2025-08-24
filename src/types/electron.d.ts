// Electron API の型定義
export interface ElectronAPI {
  getVersion: () => string;
  platform: string;
  saveProject: (projectData: ProjectData) => Promise<SaveResult>;
  saveAsProject: (projectData: ProjectData) => Promise<SaveResult>;
  loadProject: () => Promise<LoadResult>;
  onMenuAction: (callback: (action: string, data?: any) => void) => void;
  
  // セミグラフィック変換
  convertImageToSemiGraphic: (projectData: ProjectData, imageId: string) => Promise<SemiGraphicResult>;
  convertImageFileToSemiGraphic: (imagePath: string) => Promise<SemiGraphicResult>;
}

export interface ProjectData {
  version: string;
  createdAt: string;
  frames: Frame[];
  settings: {
    loopAnimation: boolean;
  };
}

export interface Frame {
  imageId: string;
  x: number;
  y: number;
  waitTime: number;
}

export interface SaveResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface LoadResult {
  success: boolean;
  data?: ProjectData;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface SemiGraphicResult {
  success: boolean;
  data?: any;
  stats?: any;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
