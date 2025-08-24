/**
 * Undo/Redo機能を管理するクラス
 */

/**
 * 操作の種類を定義
 */
export type ActionType = 
  | 'ADD_IMAGE' 
  | 'REMOVE_IMAGE'
  | 'ADD_SEQUENCE'
  | 'REMOVE_SEQUENCE'
  | 'MODIFY_SEQUENCE'
  | 'ADD_FRAME'
  | 'REMOVE_FRAME'
  | 'MODIFY_FRAME'
  | 'EDIT_FRAME'
  | 'INSERT_FRAME'
  | 'MOVE_FRAME'
  | 'MODIFY_SETTINGS';

/**
 * 実行可能な操作を表す抽象クラス
 */
export abstract class Action {
  public readonly type: ActionType;
  public readonly description: string;
  public readonly timestamp: Date;

  constructor(type: ActionType, description: string) {
    this.type = type;
    this.description = description;
    this.timestamp = new Date();
  }

  abstract execute(): void;
  abstract undo(): void;

  /**
   * Redo操作（デフォルトではexecute()と同じ）
   */
  redo(): void {
    this.execute();
  }
}

/**
 * 画像追加操作
 */
export class AddImageAction extends Action {
  constructor(
    private imageId: string,
    private imageData: any,
    private executeCallback: (imageId: string, imageData: any) => void,
    private undoCallback: (imageId: string) => void
  ) {
    super('ADD_IMAGE', `画像を追加: ${imageId}`);
  }

  execute(): void {
    this.executeCallback(this.imageId, this.imageData);
  }

  undo(): void {
    this.undoCallback(this.imageId);
  }
}

/**
 * 画像削除操作
 */
export class RemoveImageAction extends Action {
  constructor(
    private imageId: string,
    private imageData: any,
    private executeCallback: (imageId: string) => void,
    private undoCallback: (imageId: string, imageData: any) => void
  ) {
    super('REMOVE_IMAGE', `画像を削除: ${imageId}`);
  }

  execute(): void {
    this.executeCallback(this.imageId);
  }

  undo(): void {
    this.undoCallback(this.imageId, this.imageData);
  }
}

/**
 * シーケンス操作の基底クラス
 */
export class SequenceAction extends Action {
  constructor(
    type: ActionType,
    description: string,
    private executeCallback: () => void,
    private undoCallback: () => void
  ) {
    super(type, description);
  }

  execute(): void {
    this.executeCallback();
  }

  undo(): void {
    this.undoCallback();
  }
}

/**
 * 汎用的なコールバック型アクション
 * 簡単なアクションを作成する際に使用
 */
export class CallbackAction extends Action {
  constructor(
    type: ActionType,
    description: string,
    private executeCallback: () => void,
    private undoCallback: () => void,
    private redoCallback?: () => void
  ) {
    super(type, description);
  }

  execute(): void {
    this.executeCallback();
  }

  undo(): void {
    this.undoCallback();
  }

  redo(): void {
    if (this.redoCallback) {
      this.redoCallback();
    } else {
      super.redo(); // デフォルトの実装（execute()を呼ぶ）
    }
  }
}

/**
 * Undo/Redoマネージャークラス
 */
export class UndoRedoManager {
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];
  private maxHistorySize: number = 100;
  private listeners: ((canUndo: boolean, canRedo: boolean) => void)[] = [];

  /**
   * 操作を実行してヒストリーに追加
   */
  executeAction(action: Action): void {
    try {
      action.execute();
      this.addToHistory(action);
    } catch (error) {
      console.error(`操作の実行に失敗しました: ${action.description}`, error);
      throw error;
    }
  }

  /**
   * 操作をヒストリーに追加（既に実行済みの操作用）
   */
  addToHistory(action: Action): void {
    this.undoStack.push(action);
    this.redoStack = []; // 新しい操作を追加したらRedoスタックをクリア

    // ヒストリーサイズの制限
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    this.notifyListeners();
  }

  /**
   * Undo操作を実行
   */
  undo(): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const action = this.undoStack.pop()!;
    try {
      action.undo();
      this.redoStack.push(action);
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error(`Undo操作に失敗しました: ${action.description}`, error);
      // エラーが発生した場合は操作を元に戻す
      this.undoStack.push(action);
      return false;
    }
  }

  /**
   * Redo操作を実行
   */
  redo(): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const action = this.redoStack.pop()!;
    try {
      action.redo();
      this.undoStack.push(action);
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error(`Redo操作に失敗しました: ${action.description}`, error);
      // エラーが発生した場合は操作を元に戻す
      this.redoStack.push(action);
      return false;
    }
  }

  /**
   * Undoが可能かどうか
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Redoが可能かどうか
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * 最後のUndo操作の説明を取得
   */
  getUndoDescription(): string | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * 最後のRedo操作の説明を取得
   */
  getRedoDescription(): string | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * ヒストリーをクリア
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /**
   * 状態変更リスナーを追加
   */
  addListener(listener: (canUndo: boolean, canRedo: boolean) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 状態変更リスナーを削除
   */
  removeListener(listener: (canUndo: boolean, canRedo: boolean) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * リスナーに状態変更を通知
   */
  private notifyListeners(): void {
    const canUndo = this.canUndo();
    const canRedo = this.canRedo();
    
    this.listeners.forEach(listener => {
      try {
        listener(canUndo, canRedo);
      } catch (error) {
        console.error('Undo/Redoリスナーエラー:', error);
      }
    });
  }

  /**
   * ヒストリーの統計情報を取得
   */
  getHistoryStats(): { undoCount: number; redoCount: number; maxSize: number } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      maxSize: this.maxHistorySize
    };
  }

  /**
   * 最大ヒストリーサイズを設定
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(1, size);
    
    // 既存のヒストリーがサイズを超えている場合は調整
    while (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
    while (this.redoStack.length > this.maxHistorySize) {
      this.redoStack.shift();
    }
  }
}
