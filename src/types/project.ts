/**
 * プロジェクト関連の型定義
 */

/**
 * 画像リソース情報
 */
export interface ImageResource {
  id: string;
  filename: string;
  filePath?: string; // 画像ファイルの絶対パス
  width: number;
  height: number;
  imageElement?: HTMLImageElement;
}

/**
 * アニメーションフレーム情報
 */
export interface AnimationFrame {
  imageId: string;
  x: number;
  y: number;
  waitTime: number; // 1/60秒単位での待ち時間
}

/**
 * アニメーションシーケンス
 */
export interface AnimationSequence {
  name: string;
  frames: AnimationFrame[];
  loop: boolean;
}

/**
 * プロジェクトデータ
 */
export interface ProjectData {
  name: string;
  version: string;
  images: ImageResource[];
  sequences: AnimationSequence[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * プロジェクト設定
 */
export interface ProjectSettings {
  canvasWidth: number;
  canvasHeight: number;
  defaultFrameRate: number;
  backgroundColor: string;
}

/**
 * ファイル操作の結果
 */
export interface FileOperationResult {
  success: boolean;
  filePath?: string;
  error?: string;
  canceled?: boolean;
}

/**
 * プロジェクト読み込み結果
 */
export interface ProjectLoadResult extends FileOperationResult {
  data?: ProjectData;
}
