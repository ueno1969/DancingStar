/**
 * アクション基底クラス
 */
class BaseAction {
  constructor(type, description, executeCallback, undoCallback) {
    this.type = type;
    this.description = description;
    this.timestamp = new Date();
    this.executeCallback = executeCallback;
    this.undoCallback = undoCallback;
  }

  execute() {
    if (this.executeCallback) {
      this.executeCallback();
    }
  }

  undo() {
    if (this.undoCallback) {
      this.undoCallback();
    }
  }

  redo() {
    this.execute();
  }
}

/**
 * JavaScript版のUndo/Redoマネージャークラス
 */
class UndoRedoManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistorySize = 100;
    this.listeners = [];
  }

  /**
   * 操作を実行してヒストリーに追加
   */
  executeAction(action) {
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
  addToHistory(action) {
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
  undo() {
    if (this.undoStack.length === 0) {
      return false;
    }

    const action = this.undoStack.pop();
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
  redo() {
    if (this.redoStack.length === 0) {
      return false;
    }

    const action = this.redoStack.pop();
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
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Redoが可能かどうか
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * 最後のUndo操作の説明を取得
   */
  getUndoDescription() {
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * 最後のRedo操作の説明を取得
   */
  getRedoDescription() {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * ヒストリーをクリア
   */
  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /**
   * 状態変更リスナーを追加
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 状態変更リスナーを削除
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * リスナーに状態変更を通知
   */
  notifyListeners() {
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
}
