import { UndoRedoManager, Action } from './undo-redo-manager';

/**
 * プロジェクトの編集状態を管理するクラス
 */
export class EditStateManager {
  private isModified: boolean = false;
  private lastModifiedTime: Date | null = null;
  private changeListeners: (() => void)[] = [];
  private saveListeners: (() => void)[] = [];
  private undoRedoManager: UndoRedoManager;

  constructor() {
    this.undoRedoManager = new UndoRedoManager();
    
    // Undo/Redoの状態変更をリッスン
    this.undoRedoManager.addListener((_canUndo, _canRedo) => {
      // Undo/Redoの状態が変更されたときに変更リスナーに通知
      this.notifyChangeListeners();
    });
  }

  /**
   * プロジェクトが変更されたことを記録
   */
  markAsModified(): void {
    if (!this.isModified) {
      this.isModified = true;
      this.lastModifiedTime = new Date();
      this.notifyChangeListeners();
      console.log('プロジェクトが変更されました:', this.lastModifiedTime.toLocaleTimeString());
    }
  }

  /**
   * プロジェクトが保存されたことを記録
   */
  markAsSaved(): void {
    if (this.isModified) {
      this.isModified = false;
      this.lastModifiedTime = null;
      this.notifySaveListeners();
      console.log('プロジェクトが保存されました');
    }
  }

  /**
   * 変更があるかどうかを取得
   */
  hasUnsavedChanges(): boolean {
    return this.isModified;
  }

  /**
   * 最後の変更時刻を取得
   */
  getLastModifiedTime(): Date | null {
    return this.lastModifiedTime;
  }

  /**
   * 編集状態をリセット（新しいプロジェクト作成時など）
   */
  reset(): void {
    this.isModified = false;
    this.lastModifiedTime = null;
    this.undoRedoManager.clearHistory();
    this.notifyChangeListeners();
  }

  /**
   * 操作を実行してUndo/Redoヒストリーに追加
   */
  executeAction(action: Action): void {
    this.undoRedoManager.executeAction(action);
    this.markAsModified();
  }

  /**
   * Undo操作を実行
   */
  undo(): boolean {
    const result = this.undoRedoManager.undo();
    if (result) {
      this.markAsModified();
    }
    return result;
  }

  /**
   * Redo操作を実行
   */
  redo(): boolean {
    const result = this.undoRedoManager.redo();
    if (result) {
      this.markAsModified();
    }
    return result;
  }

  /**
   * Undoが可能かどうか
   */
  canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }

  /**
   * Redoが可能かどうか
   */
  canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }

  /**
   * Undo操作の説明を取得
   */
  getUndoDescription(): string | null {
    return this.undoRedoManager.getUndoDescription();
  }

  /**
   * Redo操作の説明を取得
   */
  getRedoDescription(): string | null {
    return this.undoRedoManager.getRedoDescription();
  }

  /**
   * UndoRedoManagerのインスタンスを取得
   */
  getUndoRedoManager(): UndoRedoManager {
    return this.undoRedoManager;
  }

  /**
   * 変更通知リスナーを追加
   */
  addChangeListener(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * 保存通知リスナーを追加
   */
  addSaveListener(listener: () => void): void {
    this.saveListeners.push(listener);
  }

  /**
   * 変更リスナーを削除
   */
  removeChangeListener(listener: () => void): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /**
   * 保存リスナーを削除
   */
  removeSaveListener(listener: () => void): void {
    const index = this.saveListeners.indexOf(listener);
    if (index > -1) {
      this.saveListeners.splice(index, 1);
    }
  }

  /**
   * 変更通知リスナーに通知
   */
  private notifyChangeListeners(): void {
    this.changeListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('変更リスナーエラー:', error);
      }
    });
  }

  /**
   * 保存通知リスナーに通知
   */
  private notifySaveListeners(): void {
    this.saveListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('保存リスナーエラー:', error);
      }
    });
  }
}
