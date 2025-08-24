/**
 * 編集状態管理クラス（レンダラープロセス用）
 */
class EditStateTracker {
  constructor() {
    this.hasUnsavedChanges = false;
    this.lastSaveTime = null;
    this.changeListeners = [];
    this.autoSaveInterval = null;
    this.autoSaveEnabled = true;
    
    console.log('EditStateTracker構築完了 - 自動保存有効:', this.autoSaveEnabled);
    
    // プロジェクトパス変更のイベントリスナーを設定
    this.setupProjectPathListener();
  }

  /**
   * プロジェクトパス変更のイベントリスナーを設定
   */
  setupProjectPathListener() {
    window.electronAPI.onProjectPathChanged((path) => {
      this.updateWindowTitle();
      console.log('プロジェクトパスが変更されました:', path);
    });
  }

  /**
   * プロジェクトパスを更新（renderer.jsから呼び出し用）
   */
  updateProjectPath(path) {
    // 現在は何もしない（プロジェクトパスは常にProjectManagerから取得）
    console.log('EditStateTracker: プロジェクトパス更新通知:', path);
  }

  /**
   * 変更を記録
   */
  markAsModified() {
    console.log('EditStateTracker.markAsModified呼び出し');
    console.log('現在の未保存状態:', this.hasUnsavedChanges);
    console.log('自動保存有効:', this.autoSaveEnabled);
    
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      this.notifyChangeListeners();
      this.updateWindowTitle();
      
      console.log('変更状態を記録しました - 自動保存をスケジュール');
      
      // 自動保存が有効な場合、プロジェクトデータを送信
      if (this.autoSaveEnabled) {
        this.scheduleAutoSave();
      } else {
        console.log('自動保存が無効なのでスケジュールしません');
      }
    } else {
      console.log('既に変更状態なのでスキップ');
    }
  }

  /**
   * 保存済みとしてマーク
   */
  markAsSaved() {
    this.hasUnsavedChanges = false;
    this.lastSaveTime = new Date();
    this.notifyChangeListeners();
    this.updateWindowTitle();
  }

  /**
   * 自動保存をスケジュール
   */
  scheduleAutoSave() {
    console.log('自動保存をスケジュール');
    
    // 即時に自動保存を実行（スケジューリングはメインプロセス側で管理）
    this.performAutoSave();
    
    // 既存のタイマーは不要（メインプロセス側で管理されるため）
    if (this.autoSaveInterval) {
      console.log('既存の自動保存タイマーをクリア');
      clearTimeout(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * 自動保存を実行
   */
  async performAutoSave() {
    try {
      console.log('自動保存開始:', new Date().toLocaleTimeString());
      console.log('未保存の変更:', this.hasUnsavedChanges);
      
      const projectData = window.getCurrentProjectData ? window.getCurrentProjectData() : null;
      console.log('プロジェクトデータ取得:', projectData);
      
      if (projectData && this.hasUnsavedChanges) {
        console.log('自動保存API呼び出し...');
        
        // electronAPIが利用可能かチェック
        if (!window.electronAPI || !window.electronAPI.saveAutoSaveNow) {
          console.error('electronAPI.saveAutoSaveNowが利用できません');
          if (window.notifications) {
            window.notifications.warning('自動保存エラー', 'API が利用できません', 5000);
          }
          return;
        }
        
        // 手動自動保存APIを使用
        const result = await window.electronAPI.saveAutoSaveNow(projectData);
        console.log('自動保存結果:', result);
        
        if (result.success) {
          if (window.notifications) {
            window.notifications.showStatus('自動保存完了', 'success', 2000);
          }
          console.log('自動保存完了:', new Date().toLocaleTimeString());
        } else {
          console.error('自動保存エラー:', result.error);
          if (window.notifications) {
            window.notifications.warning('自動保存エラー', 'プロジェクトの自動保存に失敗しました', 5000);
          }
        }
      } else {
        console.log('自動保存スキップ - プロジェクトデータなしまたは未保存の変更なし');
      }
    } catch (error) {
      console.error('自動保存エラー:', error);
      if (window.notifications) {
        window.notifications.warning('自動保存エラー', 'プロジェクトの自動保存に失敗しました', 5000);
      }
    }
  }

  /**
   * 変更リスナーを追加
   */
  addChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  /**
   * 変更リスナーに通知
   */
  notifyChangeListeners() {
    this.changeListeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('変更リスナーエラー:', error);
      }
    });
  }

  /**
   * ウィンドウタイトルを更新
   */
  async updateWindowTitle() {
    let title = 'Z80 Dancing Editor DancingStar';
    
    // プロジェクトパスを取得してファイル名を追加
    try {
      const projectPath = await window.electronAPI.getCurrentProjectPath();
      if (projectPath) {
        const fileName = projectPath.split(/[\\/]/).pop();
        title += ` - ${fileName}`;
      }
    } catch (error) {
      console.warn('EditStateTracker: プロジェクトパス取得エラー:', error);
    }
    
    const indicator = this.hasUnsavedChanges ? ' *' : '';
    document.title = title + indicator;
  }

  /**
   * 未保存の変更があるかどうか
   */
  hasChanges() {
    return this.hasUnsavedChanges;
  }

  /**
   * 自動保存の有効/無効を設定
   */
  setAutoSaveEnabled(enabled) {
    this.autoSaveEnabled = enabled;
    if (!enabled && this.autoSaveInterval) {
      clearTimeout(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
}
