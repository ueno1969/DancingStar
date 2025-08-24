// アニメーション機能のインポート（モジュール化が必要）
// TypeScriptでコンパイルされたAnimationEngineを使用
// HTMLファイルで読み込まれたモジュールはグローバルにexportsされます

// グローバル通知システムインスタンス
let notifications;

// グローバル編集状態トラッカー
let editStateTracker;

// グローバルUndo/Redoマネージャー
let undoRedoManager;

// アプリケーションの状態
let imageManager;
let animationEngine;
let currentFrames = [];
let currentImages = []; // プロジェクトの画像リソース情報
let selectedFrameIndex = -1; // 選択されたフレームのインデックス (-1は末尾を意味)

// 動画同期機能
let currentVideoElement = null;
let videoLoadedPath = null;
let syncPlaybackActive = false;
let isPaused = false; // 一時停止状態を追跡
let animationPlaybackActive = false; // アニメーション単体の再生状態を追跡
let syncPlaybackSpeed = 1.0; // 同期再生速度を管理

// 編集状態管理
let isProjectModified = false;
let lastModifiedTime = null;

/**
 * プロジェクトが変更されたことを記録
 */
function markProjectAsModified() {
  if (!isProjectModified) {
    isProjectModified = true;
    lastModifiedTime = new Date();
    updateWindowTitle();
    
    // 初回変更時に自動保存を開始
    startAutoSave();
    
    Logger.debug('プロジェクトが変更されました:', lastModifiedTime.toLocaleTimeString());
  }
}

/**
 * プロジェクトが保存されたことを記録
 */
function markProjectAsSaved() {
  if (isProjectModified) {
    isProjectModified = false;
    lastModifiedTime = null;
    updateWindowTitle();
    Logger.debug('プロジェクトが保存されました');
  }
}

/**
 * 現在のプロジェクトパスを取得
 */
async function getCurrentProjectPath() {
  try {
    return await window.electronAPI.getCurrentProjectPath();
  } catch (error) {
    console.warn('プロジェクトパス取得エラー:', error);
    return null;
  }
}

/**
 * ウィンドウタイトルを更新（変更状態を反映）
 */
async function updateWindowTitle() {
  if (typeof document !== 'undefined') {
    let baseTitle = 'Z80 Dancing Editor DancingStar';
    
    // プロジェクトパスを取得してファイル名を追加
    try {
      const projectPath = await getCurrentProjectPath();
      if (projectPath) {
        const fileName = projectPath.split(/[\\/]/).pop();
        baseTitle += ` - ${fileName}`;
      }
    } catch (error) {
      console.warn('タイトル更新でプロジェクトパス取得エラー:', error);
    }
    
    document.title = isProjectModified ? `${baseTitle} *` : baseTitle;
  }
}

/**
 * 動画ファイルを読み込み
 * @param {string} filePath 動画ファイルのパス
 */
function loadVideoFile(filePath) {
  try {
    const videoElement = document.getElementById('syncVideo');
    const videoDisplay = document.getElementById('videoDisplay');
    const syncPlayBtn = document.getElementById('syncPlayBtn');
    
    if (!videoElement || !videoDisplay || !syncPlayBtn) {
      throw new Error('動画表示用の要素が見つかりません');
    }
    
    // 動画ファイルを設定
    videoElement.src = `file://${filePath}`;
    videoLoadedPath = filePath;
    currentVideoElement = videoElement;
    
    // UI表示を更新
    videoDisplay.style.display = 'block';
    syncPlayBtn.style.display = 'inline-block';
    
    // 動画読み込み完了時の処理
    videoElement.addEventListener('loadedmetadata', () => {
      notificationSystem.showToast('成功', `動画ファイルを読み込みました: ${filePath.split(/[\\/]/).pop()}`, 'success');
      console.log('動画読み込み完了:', {
        duration: videoElement.duration,
        width: videoElement.videoWidth,
        height: videoElement.videoHeight
      });
    });
    
    // 動画の再生・一時停止状態を監視
    videoElement.addEventListener('play', () => {
      console.log('動画再生開始');
    });
    
    videoElement.addEventListener('pause', () => {
      console.log('動画一時停止');
    });
    
    videoElement.addEventListener('ended', () => {
      console.log('動画再生終了');
      syncPlaybackActive = false;
      isPaused = false; // 終了時は一時停止状態もリセット
    });
    
    // エラーハンドリング
    videoElement.addEventListener('error', (e) => {
      console.error('動画読み込みエラー:', e);
      notificationSystem.showToast('エラー', '動画ファイルの読み込みに失敗しました', 'error');
      resetVideoDisplay();
    });
    
  } catch (error) {
    console.error('動画読み込み処理エラー:', error);
    notificationSystem.showToast('エラー', error.message, 'error');
  }
}

/**
 * 動画表示をリセット
 */
function resetVideoDisplay() {
  const videoDisplay = document.getElementById('videoDisplay');
  const syncPlayBtn = document.getElementById('syncPlayBtn');
  
  if (videoDisplay) videoDisplay.style.display = 'none';
  if (syncPlayBtn) syncPlayBtn.style.display = 'none';
  
  currentVideoElement = null;
  videoLoadedPath = null;
  syncPlaybackActive = false;
  animationPlaybackActive = false; // アニメーション再生状態もリセット
  isPaused = false; // 一時停止状態もリセット
  
  // アニメーション速度を個別設定に戻す
  if (animationEngine) {
    const animationSpeed = parseFloat(document.getElementById('animationSpeed').value);
    animationEngine.setPlaybackSpeed(animationSpeed);
  }
  
  // ボタンテキストもリセット
  updatePauseButtonText(false);
}

/**
 * 同期再生を開始
 */
function startSyncPlayback() {
  if (!animationEngine) {
    console.warn('アニメーションエンジンが初期化されていません');
    return;
  }
  
  if (currentFrames.length === 0) {
    console.warn('再生するフレームがありません');
    return;
  }
  
  try {
    syncPlaybackActive = true;
    animationPlaybackActive = false; // アニメーション単体再生を無効化
    
    // 動画が読み込まれている場合は動画も再生
    if (currentVideoElement) {
      // 動画を最初から再生し、同期速度を適用
      currentVideoElement.currentTime = 0;
      currentVideoElement.playbackRate = syncPlaybackSpeed;
      currentVideoElement.play().catch(error => {
        console.warn('動画の再生に失敗しました:', error);
      });
    }
    
    // アニメーション速度と同期速度を掛け合わせて実際の速度を計算
    const animationSpeed = parseFloat(document.getElementById('animationSpeed').value);
    const actualAnimationSpeed = animationSpeed * syncPlaybackSpeed;
    
    // アニメーションも最初から再生し、計算された速度を設定
    const sequence = {
      name: '同期アニメーション',
      frames: currentFrames,
      loop: document.getElementById('loopAnimation').checked
    };
    
    animationEngine.stopAnimation(); // 既存の再生を停止
    animationEngine.setPlaybackSpeed(actualAnimationSpeed); // 計算された速度を設定
    animationEngine.playAnimation(sequence);
    
    // 選択されているフレームがある場合は、そのフレームから開始
    if (selectedFrameIndex >= 0 && selectedFrameIndex < currentFrames.length) {
      animationEngine.seekToFrame(selectedFrameIndex);
      // 動画位置も同期
      if (currentVideoElement) {
        syncVideoToFrame(selectedFrameIndex);
      }
    }
    
    // 動画終了時の処理
    if (currentVideoElement) {
      const handleVideoEnd = () => {
        if (syncPlaybackActive) {
          syncPlaybackActive = false;
          if (!document.getElementById('loopAnimation').checked) {
            animationEngine.stopAnimation();
          }
        }
        currentVideoElement.removeEventListener('ended', handleVideoEnd);
      };
      
      currentVideoElement.addEventListener('ended', handleVideoEnd);
    }
    
    // 一時停止状態をリセット
    isPaused = false;
    
  } catch (error) {
    console.error('同期再生エラー:', error);
    syncPlaybackActive = false;
  }
}

/**
 * 一時停止からの再生を再開
 */
function resumePlayback() {
  if (!syncPlaybackActive) {
    return;
  }
  
  try {
    // アニメーションを再開
    animationEngine.resumeAnimation();
    
    // 動画も再開
    if (currentVideoElement && currentVideoElement.paused) {
      // 再生速度を確実に設定してから再生
      currentVideoElement.playbackRate = syncPlaybackSpeed;
      currentVideoElement.play();
    }
    
    // 一時停止状態を解除
    isPaused = false;
    
    // ボタンテキストを更新
    updatePauseButtonText(false);
    
  } catch (error) {
    console.error('再生再開エラー:', error);
  }
}

/**
 * 同期再生速度を設定
 * @param {number} speed - 同期再生速度 (0.25, 0.5, 0.75, 1.0)
 */
function setSyncPlaybackSpeed(speed) {
  syncPlaybackSpeed = speed;
  
  // 同期再生中の場合、動画とアニメーションの速度を即座に更新
  if (syncPlaybackActive) {
    if (currentVideoElement) {
      currentVideoElement.playbackRate = speed;
    }
    if (animationEngine) {
      // アニメーション速度と同期速度を掛け合わせて実際の速度を計算
      const animationSpeed = parseFloat(document.getElementById('animationSpeed').value);
      const actualAnimationSpeed = animationSpeed * speed;
      animationEngine.setPlaybackSpeed(actualAnimationSpeed);
    }
  }
}

/**
 * 一時停止ボタンのテキストを更新
 * @param {boolean} isPausedState - true: 「再開」表示, false: 「一時停止」表示
 */
function updatePauseButtonText(isPausedState) {
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    if (isPausedState) {
      pauseBtn.innerHTML = '▶&nbsp;&nbsp;再開&nbsp;&nbsp;';
      pauseBtn.classList.remove('secondary');
      pauseBtn.classList.add('primary');
    } else {
      pauseBtn.innerHTML = '⏸ 一時停止';
      pauseBtn.classList.remove('primary');
      pauseBtn.classList.add('secondary');
    }
  }
}

/**
 * フレーム位置に応じて動画位置を同期
 * @param {number} frameIndex - フレームインデックス
 */
function syncVideoToFrame(frameIndex) {
  if (!currentVideoElement || !animationEngine) {
    return;
  }
  
  // フレームまでの累計時間を計算
  const timeToFrame = animationEngine.calculateTimeToFrame(frameIndex);
  
  // アニメーション速度を取得
  const animationSpeed = parseFloat(document.getElementById('animationSpeed').value) || 1.0;
  
  // アニメーション速度と同期再生速度を考慮した時間調整
  // アニメーション速度が速いほど動画時間は短くなる
  // syncPlaybackSpeedが1.0以外の場合、動画の実際の時間位置を正しく計算
  const adjustedTime = timeToFrame / animationSpeed;
  
  // 動画の現在時間を設定
  if (adjustedTime >= 0 && adjustedTime <= currentVideoElement.duration) {
    currentVideoElement.currentTime = adjustedTime;
  }
}

/**
 * 自動保存を開始（レンダラープロセス側で管理）
 */
async function startAutoSave() {
  try {
    if (editStateTracker) {
      editStateTracker.setAutoSaveEnabled(true);
      Logger.info('自動保存を開始しました（レンダラープロセス側）');
      
      // メインプロセス側の定期自動保存も開始
      if (window.electronAPI && window.electronAPI.startAutoSave) {
        const projectData = getCurrentProjectData();
        const result = await window.electronAPI.startAutoSave(projectData);
        if (result.success) {
          console.log('メインプロセス側の自動保存も開始しました');
        } else {
          console.error('メインプロセス側の自動保存開始に失敗');
        }
      }
    }
  } catch (error) {
    Logger.error('自動保存開始エラー:', error);
  }
}

/**
 * 自動保存を停止
 */
async function stopAutoSave() {
  try {
    if (editStateTracker) {
      editStateTracker.setAutoSaveEnabled(false);
      Logger.info('自動保存を停止しました');
      
      // メインプロセス側の自動保存も停止
      if (window.electronAPI && window.electronAPI.stopAutoSave) {
        const result = await window.electronAPI.stopAutoSave();
        if (result.success) {
          console.log('メインプロセス側の自動保存も停止しました');
        } else {
          console.error('メインプロセス側の自動保存停止に失敗');
        }
      }
    }
  } catch (error) {
    Logger.error('自動保存停止エラー:', error);
  }
}

/**
 * アプリ終了時の処理
 */
async function handleAppQuit() {
  Logger.info('アプリ終了確認処理を開始');
  
  try {
    if (isProjectModified) {
      // 未保存の変更がある場合の確認
      const shouldSave = confirm(
        'プロジェクトに未保存の変更があります。\n' +
        '保存してから終了しますか？\n\n' +
        'OK: 保存して終了\n' +
        'キャンセル: 保存せずに終了'
      );
      
      if (shouldSave) {
        // 保存処理
        await new Promise((resolve, reject) => {
          const saveOperation = async () => {
            try {
              const projectData = getCurrentProjectData();
              const result = await window.electronAPI.saveProject(projectData);
              
              if (result.success) {
                markProjectAsSaved();
                resolve();
              } else if (!result.canceled) {
                // 保存エラー（キャンセル以外）
                throw new Error(result.error || '保存に失敗しました');
              } else {
                // キャンセルされた場合は終了もキャンセル
                reject(new Error('保存がキャンセルされました'));
              }
            } catch (error) {
              reject(error);
            }
          };
          
          saveOperation();
        });
      }
    }
    
    // 自動保存を停止
    stopAutoSave();
    
    // 自動保存ファイルをクリア（必要に応じて）
    if (window.electronAPI.clearAutoSave) {
      await window.electronAPI.clearAutoSave();
    }
    
    return { allowQuit: true };
    
  } catch (error) {
    Logger.error('終了処理エラー:', error);
    
    // エラーが発生した場合の確認
    const forceQuit = confirm(
      '終了処理でエラーが発生しました。\n' +
      'それでも終了しますか？\n\n' +
      error.message
    );
    
    return { allowQuit: forceQuit };
  }
}

// グローバルに公開（メインプロセスから呼び出されるため）
window.handleAppQuit = handleAppQuit;

// DOMContentLoaded イベント
document.addEventListener('DOMContentLoaded', async () => {
  // 通知システムを初期化
  notifications = new NotificationSystem();
  
  // 編集状態トラッカーを初期化
  editStateTracker = new EditStateTracker();
  console.log('EditStateTracker初期化完了:', editStateTracker);
  console.log('自動保存有効:', editStateTracker.autoSaveEnabled);
  
  // Undo/Redoマネージャーを初期化
  undoRedoManager = new UndoRedoManager();
  console.log('UndoRedoManager初期化完了:', undoRedoManager);
  
  // Undo/Redoの状態変更をUIに反映
  undoRedoManager.addListener((canUndo, canRedo) => {
    updateUndoRedoUI(canUndo, canRedo);
  });
  
  Logger.info('Z80 Dancing Editor アニメーション機能が起動しました！');
  
  // アニメーションシステムを初期化
  const canvas = document.getElementById('animationCanvas');
  imageManager = new SimpleImageManager();
  animationEngine = new AnimationEngine(canvas, imageManager);
  
  // フレーム変更時のコールバックを設定
  animationEngine.setOnFrameChange((frameInfo) => {
    updateFrameInfo(frameInfo);
    
    // selectedFrameIndexを単一の真実のソースとして使用
    if (frameInfo && frameInfo.frameIndex >= 0) {
      selectedFrameIndex = frameInfo.frameIndex;
      loadFrameToInputs(selectedFrameIndex);
      updateFrameSequence();
      
      // 動画が読み込まれており、同期再生中または一時停止中の場合は動画位置も同期
      if (currentVideoElement && (syncPlaybackActive || isPaused)) {
        syncVideoToFrame(selectedFrameIndex);
      }
    }
  });
  
  // 実際の画像ファイルを読み込み（なければテスト画像を生成）
  try {
    await imageManager.loadImagesFromDirectory();
    // 読み込んだ画像をcurrentImagesに同期
    currentImages = imageManager.getImageList().map(image => ({
      id: image.id,
      filename: image.filename,
      filePath: image.filePath || undefined, // ファイルパスを含める
      width: image.width,
      height: image.height
    }));
    console.log('currentImagesを更新:', currentImages);
    notifications.info('画像読み込み完了', 'imagesディレクトリから画像ファイルを読み込みました');
  } catch (error) {
    console.error('画像読み込みエラー:', error);
    notifications.warning('画像読み込みエラー', '画像ファイルが見つかりませんでした');
    // 画像がない場合は空の配列を設定
    currentImages = [];
    console.log('currentImages（画像なし）を更新:', currentImages);
  }
  updateImageList();
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // 速度制御UIの初期値を設定
  const initialAnimationSpeed = parseFloat(document.getElementById('animationSpeed').value);
  document.getElementById('speedValue').textContent = initialAnimationSpeed.toFixed(2);
  document.getElementById('animationSpeedInput').value = initialAnimationSpeed;
  
  const initialSyncSpeedIndex = parseInt(document.getElementById('syncSpeed').value);
  const syncSpeeds = [0.25, 0.5, 0.75, 1.0];
  document.getElementById('syncSpeedValue').textContent = syncSpeeds[initialSyncSpeedIndex].toFixed(2);
  
  // Electron APIが利用可能かチェック
  if (window.electronAPI) {
    Logger.info('Electron Version:', window.electronAPI.getVersion());
    Logger.info('Platform:', window.electronAPI.platform);
    
    // プロジェクトパス変更イベントのリスナーを設定
    window.electronAPI.onProjectPathChanged(async (path) => {
      await updateWindowTitle();
      console.log('プロジェクトパスが変更されました:', path);
      
      // EditStateTrackerにもプロジェクトパスを通知
      if (editStateTracker && editStateTracker.updateProjectPath) {
        editStateTracker.updateProjectPath(path);
      }
    });
    
    // API関数が正しく定義されているかチェック
    const apiStatus = {
      saveProject: typeof window.electronAPI.saveProject,
      loadProject: typeof window.electronAPI.loadProject,
      newProject: typeof window.electronAPI.newProject,
      onMenuAction: typeof window.electronAPI.onMenuAction,
      hasAutoSave: typeof window.electronAPI.hasAutoSave,
      loadAutoSave: typeof window.electronAPI.loadAutoSave,
      clearAutoSave: typeof window.electronAPI.clearAutoSave,
      confirmQuit: typeof window.electronAPI.confirmQuit,
      onProjectPathChanged: typeof window.electronAPI.onProjectPathChanged,
      getCurrentProjectPath: typeof window.electronAPI.getCurrentProjectPath
    };
    Logger.info('利用可能なAPI関数:', apiStatus);
    
    // 未定義のAPI関数を警告
    Object.entries(apiStatus).forEach(([name, type]) => {
      if (type === 'undefined') {
        Logger.warn(`API関数 ${name} が定義されていません`);
      }
    });
    
    // 自動保存ファイルの確認と復元
    setTimeout(() => {
      handleAutoSaveRestore();
    }, 1000); // 1秒後に実行
    
    // 現在のプロジェクトパスを取得（自動保存復元の後）
    setTimeout(async () => {
      try {
        // ウィンドウタイトルを初期化（プロジェクトパスを反映）
        await updateWindowTitle();
        
        // EditStateTrackerにもプロジェクトパスを設定
        if (editStateTracker) {
          const projectPath = await getCurrentProjectPath();
          if (editStateTracker.updateProjectPath) {
            editStateTracker.updateProjectPath(projectPath);
          }
        }
        
        const projectPath = await getCurrentProjectPath();
        console.log('初期プロジェクトパス取得:', projectPath);
      } catch (error) {
        console.warn('初期プロジェクトパス取得エラー:', error);
      }
    }, 1500); // 1.5秒後に実行（自動保存復元の後）
    
    // 自動保存の初期化（さらに遅らせる）
    setTimeout(async () => {
      if (editStateTracker) {
        editStateTracker.setAutoSaveEnabled(true);
        console.log('自動保存機能を有効化しました');
        
        // 自動保存を開始
        await startAutoSave();
      }
    }, 2000); // 2秒後に自動保存を有効化
  } else {
    Logger.error('Electron API は利用できません');
  }
});

/**
 * 画像リストのレイアウトを更新する関数
 */
function updateImageListLayout() {
  const imageGrid = document.querySelector('.image-grid');
  if (!imageGrid) return;
  
  // 現在のグリッド設定を一時的に変更して強制的に再計算
  const originalColumns = imageGrid.style.gridTemplateColumns;
  imageGrid.style.gridTemplateColumns = 'none';
  
  // 強制的にレイアウトを再計算
  imageGrid.offsetHeight;
  
  // 元の設定に戻す
  imageGrid.style.gridTemplateColumns = originalColumns || '';
  
  // さらに確実にするため、CSSクラスを一時的に削除・追加
  const imageListPanel = document.querySelector('.image-list-panel');
  if (imageListPanel) {
    imageListPanel.classList.add('layout-updating');
    requestAnimationFrame(() => {
      imageListPanel.classList.remove('layout-updating');
    });
  }
}

function setupEventListeners() {
  // 動画読み込みボタン
  document.getElementById('loadVideoBtn').addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: '動画ファイルを選択',
        filters: [
          { name: '動画ファイル', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      });
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        loadVideoFile(result.filePaths[0]);
      }
    } catch (error) {
      console.error('動画ファイル読み込みエラー:', error);
      notificationSystem.showToast('エラー', '動画ファイルの読み込みに失敗しました', 'error');
    }
  });

  // 同期再生ボタン
  document.getElementById('syncPlayBtn').addEventListener('click', () => {
    // 全ての状態をリセットして最初から再生
    isPaused = false;
    animationPlaybackActive = false; // アニメーション単体再生を無効化
    updatePauseButtonText(false); // ボタンテキストをリセット
    startSyncPlayback();
  });

  // アニメーション制御ボタン
  document.getElementById('playBtn').addEventListener('click', () => {
    // アニメーションのみを最初から再生
    const sequence = {
      name: 'アニメーション再生',
      frames: currentFrames,
      loop: document.getElementById('loopAnimation').checked
    };
    
    // 同期再生を無効化
    syncPlaybackActive = false;
    isPaused = false;
    animationPlaybackActive = true; // アニメーション再生状態を有効化
    
    // 動画が再生中なら停止
    if (currentVideoElement && !currentVideoElement.paused) {
      currentVideoElement.pause();
    }
    
    // アニメーション個別の速度を設定
    const animationSpeed = parseFloat(document.getElementById('animationSpeed').value);
    animationEngine.setPlaybackSpeed(animationSpeed);
    animationEngine.playAnimation(sequence);
    
    // 選択されているフレームがある場合は、そのフレームから開始
    if (selectedFrameIndex >= 0 && selectedFrameIndex < currentFrames.length) {
      animationEngine.seekToFrame(selectedFrameIndex);
    }
    
    // ボタンテキストをリセット
    updatePauseButtonText(false);
  });

  document.getElementById('pauseBtn').addEventListener('click', () => {
    // 一時停止状態かどうかで動作を切り替え
    if (isPaused) {
      // 一時停止からの再開
      if (syncPlaybackActive) {
        // 同期再生の場合
        resumePlayback();
      } else if (animationPlaybackActive) {
        // アニメーションのみの場合
        animationEngine.resumeAnimation();
        isPaused = false;
      }
      updatePauseButtonText(false); // 「一時停止」表示に戻す
    } else {
      // 何らかの再生中の場合
      if (syncPlaybackActive || animationPlaybackActive) {
        // 一時停止
        animationEngine.pauseAnimation();
        
        // 動画も一時停止（動画が読み込まれていて再生中の場合）
        if (currentVideoElement && !currentVideoElement.paused) {
          currentVideoElement.pause();
        }
        
        isPaused = true;
        updatePauseButtonText(true); // 「再開」表示に変更
      } else {
        // 何も再生していない場合は停止処理（リセット）
        if (animationEngine) {
          animationEngine.stopAnimation();
        }
        
        // 動画も停止
        if (currentVideoElement) {
          currentVideoElement.pause();
          currentVideoElement.currentTime = 0;
        }
        
        // 全ての状態をリセット
        syncPlaybackActive = false;
        animationPlaybackActive = false;
        isPaused = false;
        updatePauseButtonText(false);
      }
    }
  });

  // フレーム追加ボタン（末尾に追加）
  document.getElementById('addFrameBtn').addEventListener('click', () => {
    const frame = createFrameFromInputs();
    if (frame) {
      const addIndex = currentFrames.length;
      
      // Undo/Redoヒストリーに追加
      addActionToHistory(
        'ADD_FRAME',
        `フレーム ${addIndex + 1} を追加`,
        () => {
          currentFrames.push(frame);
          updateFrameSequence();
        },
        () => {
          currentFrames.pop();
          updateFrameSequence();
        }
      );
      
      // 実際の操作を実行
      currentFrames.push(frame);
      markProjectAsModified(); // 編集状態を記録
      updateFrameSequence();
    } else {
      notifications.warning('入力エラー', '画像を選択してください');
    }
  });

  // フレーム挿入ボタン（選択位置に挿入）
  document.getElementById('insertFrameBtn').addEventListener('click', () => {
    const frame = createFrameFromInputs();
    if (frame) {
      const insertIndex = selectedFrameIndex >= 0 ? selectedFrameIndex + 1 : currentFrames.length;
      const previousSelectedIndex = selectedFrameIndex;
      
      // Undo/Redoヒストリーに追加
      addActionToHistory(
        'INSERT_FRAME',
        `フレーム ${insertIndex + 1} を挿入`,
        () => {
          currentFrames.splice(insertIndex, 0, frame);
          selectedFrameIndex = insertIndex;
          updateFrameSequence();
        },
        () => {
          currentFrames.splice(insertIndex, 1);
          selectedFrameIndex = previousSelectedIndex;
          updateFrameSequence();
        }
      );
      
      // 実際の操作を実行
      currentFrames.splice(insertIndex, 0, frame);
      selectedFrameIndex = insertIndex; // 挿入したフレームを選択状態にする
      markProjectAsModified(); // 編集状態を記録
      updateFrameSequence();
    } else {
      notifications.warning('入力エラー', '画像を選択してください');
    }
  });

  // フレーム編集ボタン
  document.getElementById('editFrameBtn').addEventListener('click', () => {
    if (selectedFrameIndex >= 0) {
      const newFrame = createFrameFromInputs();
      if (newFrame) {
        const oldFrame = { ...currentFrames[selectedFrameIndex] }; // 元のフレームデータをコピー
        const editIndex = selectedFrameIndex;
        
        // Undo/Redoヒストリーに追加
        addActionToHistory(
          'EDIT_FRAME',
          `フレーム ${editIndex + 1} を編集`,
          () => {
            currentFrames[editIndex] = { ...newFrame };
            updateFrameSequence();
            // 編集後の値を入力フィールドに反映
            if (selectedFrameIndex === editIndex) {
              loadFrameToInputs(editIndex);
            }
          },
          () => {
            currentFrames[editIndex] = { ...oldFrame };
            updateFrameSequence();
            // 編集前の値を入力フィールドに復元
            if (selectedFrameIndex === editIndex) {
              loadFrameToInputs(editIndex);
            }
          }
        );
        
        // 実際の操作を実行
        currentFrames[selectedFrameIndex] = newFrame;
        markProjectAsModified(); // 編集状態を記録
        updateFrameSequence();
        
        // 編集完了後、フォーカスをフレームシーケンスに戻す
        setTimeout(() => {
          focusFrameSequence();
        }, 100);
      } else {
        notifications.warning('入力エラー', '画像を選択してください');
      }
    } else {
      notifications.warning('フレーム未選択', '編集するフレームを選択してください');
    }
  });

  // プレビューボタン
  document.getElementById('previewFrameBtn').addEventListener('click', () => {
    const imageId = document.getElementById('imageIdSelect').value;
    const x = parseInt(document.getElementById('xPosition').value);
    const y = parseInt(document.getElementById('yPosition').value);

    if (imageId) {
      animationEngine.previewImage(imageId, x, y);
    }
  });

  // Undo/Redoボタンのイベントリスナー
  document.getElementById('undoBtn').addEventListener('click', () => {
    performUndo();
  });

  document.getElementById('redoBtn').addEventListener('click', () => {
    performRedo();
  });

  // キーボードショートカット (Ctrl+Z, Ctrl+Y, カーソルキー)
  document.addEventListener('keydown', (event) => {
    // フォーカスが入力フィールドにある場合はスキップ
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' || 
      activeElement.tagName === 'SELECT'
    );
    
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        performUndo();
      } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
        event.preventDefault();
        performRedo();
      }
    } else if (event.key === 'Escape' && isInputFocused) {
      // 入力フィールドからEscapeでフォーカスを外す
      event.preventDefault();
      activeElement.blur();
      focusFrameSequence();
    } else if (!isInputFocused) {
      // 入力フィールドにフォーカスがない場合のみカーソルキー操作を有効にする
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          if (event.shiftKey) {
            moveSelectedFrame(-1); // Shift+Up: フレームを上に移動
          } else {
            moveFrameSelection(-1); // Up: 選択を上に移動
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (event.shiftKey) {
            moveSelectedFrame(1); // Shift+Down: フレームを下に移動
          } else {
            moveFrameSelection(1); // Down: 選択を下に移動
          }
          break;
        case 'Enter':
          if (selectedFrameIndex >= 0) {
            event.preventDefault();
            focusFrameEditor();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedFrameIndex >= 0) {
            event.preventDefault();
            removeFrame(selectedFrameIndex);
          }
          break;
        case ' ':
        case 'Space':
          // 動画再生中のみSpaceキーで一時停止・再開
          if (syncPlaybackActive || animationPlaybackActive) {
            event.preventDefault();
            // 一時停止ボタンのクリックイベントを発火
            document.getElementById('pauseBtn').click();
          }
          break;
      }
    }
  });

  // 入力フィールドの変更イベントリスナー（リアルタイムプレビュー用）
  const inputFields = ['imageIdSelect', 'xPosition', 'yPosition', 'waitTime'];
  inputFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        // 選択されたフレームがある場合、リアルタイムでプレビューを更新
        if (selectedFrameIndex >= 0) {
          const imageId = document.getElementById('imageIdSelect').value;
          const x = parseInt(document.getElementById('xPosition').value) || 0;
          const y = parseInt(document.getElementById('yPosition').value) || 0;
          
          if (imageId) {
            animationEngine.previewImage(imageId, x, y);
          }
        }
      });
      
      // Enterキーでフレーム編集を実行
      field.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && selectedFrameIndex >= 0) {
          event.preventDefault();
          document.getElementById('editFrameBtn').click();
          // 編集完了後、フォーカスをフレームシーケンスに戻す
          setTimeout(() => {
            focusFrameSequence();
          }, 100);
        }
      });
    }
  });



  // 設定変更イベント
  document.getElementById('loopAnimation').addEventListener('change', () => {
    markProjectAsModified(); // 設定変更も編集として記録
  });
  
  // アニメーション速度スライダーとinputのイベントリスナー
  let isDragging = false;
  let dragStartTime = 0;
  
  const animationSpeedSlider = document.getElementById('animationSpeed');
  
  animationSpeedSlider.addEventListener('mousedown', () => {
    isDragging = false;
    dragStartTime = Date.now();
  });
  
  animationSpeedSlider.addEventListener('mousemove', () => {
    if (Date.now() - dragStartTime > 100) { // 100ms以上でドラッグ判定
      isDragging = true;
    }
  });
  
  animationSpeedSlider.addEventListener('input', (event) => {
    const currentValue = parseFloat(event.target.value);
    let speed;
    
    if (isDragging) {
      // ドラッグ時は任意の値を使用
      speed = currentValue;
    } else {
      // クリック時は定義済み速度にスナップ
      const predefinedSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      let closestSpeed = predefinedSpeeds[0];
      let minDiff = Math.abs(currentValue - predefinedSpeeds[0]);
      
      for (let i = 1; i < predefinedSpeeds.length; i++) {
        const diff = Math.abs(currentValue - predefinedSpeeds[i]);
        if (diff < minDiff) {
          minDiff = diff;
          closestSpeed = predefinedSpeeds[i];
        }
      }
      speed = closestSpeed;
      event.target.value = speed; // スライダーを定義済み位置にセット
    }
    
    // アニメーション速度を変更
    if (syncPlaybackActive) {
      // 同期再生中の場合、アニメーション速度と同期速度を掛け合わせる
      const actualAnimationSpeed = speed * syncPlaybackSpeed;
      animationEngine.setPlaybackSpeed(actualAnimationSpeed);
    } else {
      // 通常再生の場合、アニメーション速度をそのまま適用
      animationEngine.setPlaybackSpeed(speed);
    }
    
    // 表示を更新
    document.getElementById('speedValue').textContent = speed.toFixed(2);
    document.getElementById('animationSpeedInput').value = speed;
  });
  
  animationSpeedSlider.addEventListener('mouseup', () => {
    isDragging = false;
  });

  document.getElementById('animationSpeedInput').addEventListener('input', (event) => {
    const speed = Math.max(0.25, Math.min(2, parseFloat(event.target.value) || 1));
    
    // アニメーション速度を変更
    if (syncPlaybackActive) {
      // 同期再生中の場合、アニメーション速度と同期速度を掛け合わせる
      const actualAnimationSpeed = speed * syncPlaybackSpeed;
      animationEngine.setPlaybackSpeed(actualAnimationSpeed);
    } else {
      // 通常再生の場合、アニメーション速度をそのまま適用
      animationEngine.setPlaybackSpeed(speed);
    }
    
    // スライダーと表示を更新
    document.getElementById('animationSpeed').value = speed;
    document.getElementById('speedValue').textContent = speed.toFixed(2);
  });

  // 同期再生速度スライダーのイベントリスナー
  document.getElementById('syncSpeed').addEventListener('input', (event) => {
    const speedIndex = parseInt(event.target.value);
    const speeds = [0.25, 0.5, 0.75, 1.0];
    const speed = speeds[speedIndex];
    
    setSyncPlaybackSpeed(speed);
    document.getElementById('syncSpeedValue').textContent = speed.toFixed(2);
  });

  // ズーム制御ボタンのイベントリスナー
  const zoomButtons = document.querySelectorAll('.zoom-btn');
  zoomButtons.forEach(button => {
    button.addEventListener('click', (event) => {
      const zoomLevel = parseInt(event.target.dataset.zoom);
      
      // 現在のアクティブボタンを非アクティブに
      zoomButtons.forEach(btn => btn.classList.remove('active'));
      
      // クリックされたボタンをアクティブに
      event.target.classList.add('active');
      
      // アニメーションエンジンのズーム倍率を設定
      animationEngine.setZoom(zoomLevel);
      
      // 表示テキストを更新
      document.getElementById('zoomDisplayText').textContent = `${zoomLevel}倍表示`;
      
      Logger.info(`ズーム倍率を${zoomLevel}倍に変更`);
    });
  });

  // 画像インポートダイアログのイベントリスナー
  setupImageImportDialog();

  // メニューイベントのリスナーを設定
  if (window.electronAPI && window.electronAPI.onMenuAction) {
    Logger.info('メニューイベントリスナーを設定中...');
    
    window.electronAPI.onMenuAction(async (action, data) => {
      Logger.debug('メニューアクション受信:', action, data);
      
      switch (action) {
        case 'new-project':
          if (data) {
            Logger.info('データ付き新規プロジェクト作成');
            newProjectFromData(data);
          } else {
            Logger.info('通常の新規プロジェクト作成');
            newProject();
          }
          break;
        case 'save-project':
          Logger.info('プロジェクト保存開始');
          saveProject();
          break;
        case 'save-as-project':
          Logger.info('名前をつけてプロジェクト保存開始');
          saveAsProject();
          break;
        case 'load-project':
          if (data && data.success) {
            Logger.info('メニューからプロジェクト読み込み（成功データ）');
            await loadProjectFromData(data);
          } else if (data && data.error) {
            Logger.error('メニューからプロジェクト読み込み（エラー）:', data.error);
            notifications.error('読み込みエラー', data.error);
          } else {
            Logger.warn('メニューからプロジェクト読み込み（不明なデータ）:', data);
          }
          break;
        case 'restore-autosave':
          if (data) {
            Logger.info('自動保存からの復元');
            
            // 新しい形式（プロジェクトパス付き）かチェック
            if (data.projectData && typeof data.projectPath !== 'undefined') {
              // 新しい形式
              await loadProjectFromData({ success: true, data: data.projectData });
              // プロジェクトパスが復元された場合は更新
              if (data.projectPath) {
                // EditStateTrackerにもプロジェクトパスを設定
                if (editStateTracker && editStateTracker.updateProjectPath) {
                  editStateTracker.updateProjectPath(data.projectPath);
                }
                await updateWindowTitle();
                console.log('自動保存からプロジェクトパスを復元:', data.projectPath);
              }
            } else {
              // 古い形式（プロジェクトデータのみ）
              await loadProjectFromData({ success: true, data: data });
            }
            
            notifications.success('復元完了', '自動保存されたプロジェクトを復元しました');
          }
          break;
        case 'import-image':
          if (data) {
            Logger.info('画像インポート開始:', data);
            handleImageImport(data);
          }
          break;
        case 'export-z80':
          Logger.info('Z80エクスポート開始');
          exportZ80Code();
          break;
        case 'undo':
        case 'perform-undo':
          Logger.info('Undo操作開始');
          performUndo();
          break;
        case 'redo':
        case 'perform-redo':
          Logger.info('Redo操作開始');
          performRedo();
          break;
        case 'frame-select-up':
          Logger.debug('フレーム選択を上に移動');
          moveFrameSelection(-1);
          break;
        case 'frame-select-down':
          Logger.debug('フレーム選択を下に移動');
          moveFrameSelection(1);
          break;
        case 'frame-move-up':
          Logger.debug('選択フレームを上に移動');
          moveSelectedFrame(-1);
          break;
        case 'frame-move-down':
          Logger.debug('選択フレームを下に移動');
          moveSelectedFrame(1);
          break;
        default:
          Logger.warn('未知のメニューアクション:', action);
      }
    });
  } else {
    Logger.error('Electron API またはメニューアクションリスナーが利用できません');
  }

  // ウィンドウリサイズイベントリスナーを追加
  let resizeTimeout;
  window.addEventListener('resize', () => {
    // デバウンスで頻繁な実行を防ぐ
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // 画像リストの高さを再計算
      updateImageListLayout();
      Logger.debug('ウィンドウリサイズに伴い画像リストの高さを再計算しました');
    }, 100); // 100ms後に実行
  });
}



function updateImageList() {
  const imageList = document.getElementById('imageList');
  const imageSelect = document.getElementById('imageIdSelect');
  
  imageList.innerHTML = '';
  imageSelect.innerHTML = '<option value="">選択してください</option>';

  const images = imageManager.getImageList();
  images.forEach(image => {
    // 画像リストに追加
    const imageItem = document.createElement('div');
    imageItem.className = 'image-item';
    imageItem.innerHTML = `
      <img src="${image.imageElement.src}" alt="Image ${image.id}">
      <div class="image-id">${image.id}</div>
    `;
    imageItem.addEventListener('click', () => {
      document.getElementById('imageIdSelect').value = image.id;
    });
    imageList.appendChild(imageItem);

    // セレクトボックスに追加
    const option = document.createElement('option');
    option.value = image.id;
    option.textContent = `Image ${image.id}`;
    imageSelect.appendChild(option);
  });
  
  // 画像リスト更新後にレイアウトを調整
  setTimeout(() => {
    updateImageListLayout();
  }, 50);
}

function updateFrameSequence() {
  const frameSequence = document.getElementById('frameSequence');
  
  frameSequence.innerHTML = '';

  currentFrames.forEach((frame, index) => {
    const frameItem = document.createElement('div');
    frameItem.className = 'frame-item';
    
    // 選択されたフレームにはselectedクラスを追加（単一のカーソル表示）
    if (index === selectedFrameIndex) {
      frameItem.classList.add('selected');
      
      // アニメーション再生中の場合はplayingクラスも追加
      if ((animationPlaybackActive || syncPlaybackActive) && !isPaused) {
        frameItem.classList.add('playing');
      }
    }
    
    // 挿入位置を示すマーカー
    if (index === selectedFrameIndex) {
      frameItem.classList.add('insert-after');
    }

    // 画像要素の取得
    const imageElement = imageManager.getImageElement(frame.imageId);
    const thumbnailHtml = imageElement 
      ? `<div class="frame-thumbnail"><img src="${imageElement.src}" alt="Image ${frame.imageId}"></div>`
      : `<div class="frame-thumbnail frame-thumbnail-placeholder">No Image</div>`;

    frameItem.innerHTML = `
      <div class="frame-number">${index + 1}</div>
      ${thumbnailHtml}
      <div class="frame-info">
        <div>ID=${frame.imageId}, X=${frame.x}, Y=${frame.y}</div>
        <div>Wait=${frame.waitTime}</div>
      </div>
      <div class="frame-controls-mini">
        <button class="move-up" onclick="moveFrame(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="上に移動">↑</button>
        <button class="move-down" onclick="moveFrame(${index}, 1)" ${index === currentFrames.length - 1 ? 'disabled' : ''} title="下に移動">↓</button>
        <button class="edit-btn" onclick="editFrame(${index})" title="編集 (Enter)">e</button>
        <button class="remove-btn" onclick="removeFrame(${index})" title="削除 (Delete)">×</button>
      </div>
    `;
    
    // フレームをクリックして選択
    frameItem.addEventListener('click', (e) => {
      // ボタンクリックの場合は選択処理をスキップ
      if (e.target.tagName === 'BUTTON') return;
      
      console.log('フレームクリック:', index, 'selectedFrameIndex:', selectedFrameIndex);
      
      selectedFrameIndex = selectedFrameIndex === index ? -1 : index;
      updateFrameSequence();
      loadFrameToInputs(selectedFrameIndex); // 選択したフレームの値を入力フィールドに読み込み
      
      // 一時停止中またはアニメーション再生中にフレームをクリックした場合、
      // アニメーションの再生位置をそのフレームに移動
      if ((isPaused || animationPlaybackActive || syncPlaybackActive) && 
          animationEngine && 
          animationEngine.getAnimationState().sequence) {
        animationEngine.seekToFrame(index);
        
        // 同期再生中の場合は動画位置も同期
        if (syncPlaybackActive) {
          syncVideoToFrame(index);
        }
      }
    });
    
    // フレームをダブルクリックでフレーム編集エリアにフォーカス
    frameItem.addEventListener('dblclick', (e) => {
      // ボタンクリックの場合は処理をスキップ
      if (e.target.tagName === 'BUTTON') return;
      
      e.preventDefault();
      selectedFrameIndex = index;
      updateFrameSequence();
      loadFrameToInputs(selectedFrameIndex);
      focusFrameEditor();
      
      // 一時停止中またはアニメーション再生中にフレームをダブルクリックした場合、
      // アニメーションの再生位置をそのフレームに移動
      if ((isPaused || animationPlaybackActive || syncPlaybackActive) && 
          animationEngine && 
          animationEngine.getAnimationState().sequence) {
        animationEngine.seekToFrame(index);
        
        // 同期再生中の場合は動画位置も同期
        if (syncPlaybackActive) {
          syncVideoToFrame(index);
        }
      }
    });
    
    frameSequence.appendChild(frameItem);
  });
  
  // 選択されたフレームを画面内に表示
  scrollToSelectedFrame();
}

// 入力フィールドからフレームを作成
function createFrameFromInputs() {
  const imageId = document.getElementById('imageIdSelect').value;
  const x = parseInt(document.getElementById('xPosition').value);
  const y = parseInt(document.getElementById('yPosition').value);
  const waitTime = parseInt(document.getElementById('waitTime').value);

  if (imageId) {
    // 使用される画像をcurrentImagesに追加
    ensureImageInCurrentImages(imageId);
    
    markProjectAsModified(); // 編集状態を記録
    return { imageId, x, y, waitTime };
  }
  return null;
}

/**
 * 指定された画像IDがcurrentImagesに含まれていない場合、追加する
 */
function ensureImageInCurrentImages(imageId) {
  // 既にcurrentImagesに存在するかチェック
  const existingImage = currentImages.find(img => img.id === imageId);
  if (existingImage) {
    return; // 既に存在する場合は何もしない
  }
  
  // imageManagerから画像情報を取得
  const imageResource = imageManager.getImage(imageId);
  if (imageResource) {
    // imageManagerから取得した画像情報をcurrentImagesに追加
    const projectImageResource = {
      id: imageResource.id,
      filename: imageResource.filename,
      filePath: imageResource.filePath, // ここでファイルパスも含める
      width: imageResource.width,
      height: imageResource.height
      // imageElementはプロジェクトデータには含めない（保存時に除外される）
    };
    
    currentImages.push(projectImageResource);
    console.log(`画像 ${imageId} をプロジェクトに追加:`, projectImageResource);
  } else {
    console.warn(`画像 ${imageId} がimageManagerに見つかりません`);
  }
}

// フレームを移動
function moveFrame(index, direction) {
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < currentFrames.length) {
    const previousSelectedIndex = selectedFrameIndex;
    
    // Undo/Redoヒストリーに追加
    addActionToHistory(
      'MOVE_FRAME',
      `フレーム ${index + 1} を ${direction > 0 ? '下' : '上'}に移動`,
      () => {
        // フレームを交換
        [currentFrames[index], currentFrames[newIndex]] = [currentFrames[newIndex], currentFrames[index]];
        
        // 選択されたフレームのインデックスも更新
        if (selectedFrameIndex === index) {
          selectedFrameIndex = newIndex;
        } else if (selectedFrameIndex === newIndex) {
          selectedFrameIndex = index;
        }
        
        updateFrameSequence();
        // 選択フレームが移動した場合の入力フィールドを更新
        loadFrameToInputs(selectedFrameIndex);
      },
      () => {
        // 逆方向の移動で元に戻す
        [currentFrames[newIndex], currentFrames[index]] = [currentFrames[index], currentFrames[newIndex]];
        selectedFrameIndex = previousSelectedIndex;
        updateFrameSequence();
        // 移動を取り消した場合の入力フィールドを復元
        loadFrameToInputs(selectedFrameIndex);
      }
    );
    
    // 実際の操作を実行
    // フレームを交換
    [currentFrames[index], currentFrames[newIndex]] = [currentFrames[newIndex], currentFrames[index]];
    
    // 選択されたフレームのインデックスも更新
    if (selectedFrameIndex === index) {
      selectedFrameIndex = newIndex;
    } else if (selectedFrameIndex === newIndex) {
      selectedFrameIndex = index;
    }
    
    markProjectAsModified(); // 編集状態を記録
    updateFrameSequence();
    // 選択フレームが移動した場合の入力フィールドを更新
    loadFrameToInputs(selectedFrameIndex);
  }
}

function editFrame(index) {
  if (index < 0 || index >= currentFrames.length) return;
  
  // フレームを選択
  selectedFrameIndex = index;
  updateFrameSequence();
  
  // 選択したフレームのデータを入力フィールドに読み込み
  loadFrameToInputs(index);
  
  // 既存の編集ボタンをクリックして編集処理を実行
  document.getElementById('editFrameBtn').click();
}

function removeFrame(index) {
  if (index < 0 || index >= currentFrames.length) return;
  
  const removedFrame = currentFrames[index];
  const previousSelectedIndex = selectedFrameIndex;
  
  // Undo/Redoヒストリーに追加
  addActionToHistory(
    'REMOVE_FRAME',
    `フレーム ${index + 1} を削除`,
    () => {
      currentFrames.splice(index, 1);
      
      // 選択されたフレームのインデックスを調整
      if (selectedFrameIndex === index) {
        selectedFrameIndex = -1; // 削除されたフレームが選択されていた場合は選択を解除
        clearInputs(); // 入力フィールドをクリア
      } else if (selectedFrameIndex > index) {
        selectedFrameIndex--; // 削除されたフレームより後のフレームが選択されていた場合はインデックスを調整
      }
      
      updateFrameSequence();
    },
    () => {
      currentFrames.splice(index, 0, removedFrame);
      selectedFrameIndex = previousSelectedIndex;
      updateFrameSequence();
      // 削除を取り消した場合の入力フィールドを復元
      loadFrameToInputs(selectedFrameIndex);
    }
  );
  
  // 実際の操作を実行
  currentFrames.splice(index, 1);
  
  // 選択されたフレームのインデックスを調整
  if (selectedFrameIndex === index) {
    selectedFrameIndex = -1; // 削除されたフレームが選択されていた場合は選択を解除
    clearInputs(); // 入力フィールドをクリア
  } else if (selectedFrameIndex > index) {
    selectedFrameIndex--; // 削除されたフレームより後のフレームが選択されていた場合はインデックスを調整
  }
  
  markProjectAsModified(); // 編集状態を記録
  updateFrameSequence();
}

// 選択されたフレームの値を入力フィールドに読み込む
function loadFrameToInputs(frameIndex) {
  if (frameIndex >= 0 && frameIndex < currentFrames.length) {
    const frame = currentFrames[frameIndex];
    document.getElementById('imageIdSelect').value = frame.imageId;
    document.getElementById('xPosition').value = frame.x;
    document.getElementById('yPosition').value = frame.y;
    document.getElementById('waitTime').value = frame.waitTime;
  } else {
    clearInputs();
  }
}

// 入力フィールドをクリア
function clearInputs() {
  document.getElementById('imageIdSelect').value = '';
  document.getElementById('xPosition').value = 36;
  document.getElementById('yPosition').value = 2;
  document.getElementById('waitTime').value = 10;
}

/**
 * 現在のプロジェクトデータを取得
 */
function getCurrentProjectData() {
  console.log('getCurrentProjectData呼び出し');
  console.log('currentFrames:', currentFrames);
  console.log('currentImages:', currentImages);
  
  const projectData = {
    name: 'Dancing Project',
    version: '1.0.0',
    images: currentImages, // 実際の画像情報を含める
    sequences: [{
      name: 'メインシーケンス',
      frames: currentFrames,
      loop: document.getElementById('loopAnimation').checked
    }],
    settings: {
      canvasWidth: 160,
      canvasHeight: 100,
      defaultFrameRate: 60,
      backgroundColor: '#000000'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  console.log('生成されたプロジェクトデータ:', projectData);
  return projectData;
}

/**
 * プロジェクトを変更済みとしてマーク
 */
function markProjectAsModified() {
  console.log('markProjectAsModified呼び出し:', new Date().toLocaleTimeString());
  console.log('editStateTracker存在:', !!editStateTracker);
  
  if (editStateTracker) {
    console.log('編集状態トラッカーで変更をマーク');
    editStateTracker.markAsModified();
  } else {
    console.warn('editStateTrackerが初期化されていません');
  }
}

/**
 * プロジェクトを保存済みとしてマーク
 */
function markProjectAsSaved() {
  if (editStateTracker) {
    editStateTracker.markAsSaved();
  }
}

/**
 * アプリ終了時の確認処理
 */
window.handleAppQuit = async function() {
  if (!editStateTracker) {
    return { allowQuit: true };
  }

  const hasChanges = editStateTracker.hasChanges();
  
  if (!hasChanges) {
    // 変更がない場合はそのまま終了
    return { allowQuit: true };
  }

  // メインプロセスに確認ダイアログの表示を依頼
  try {
    const result = await window.electronAPI.confirmQuit(hasChanges);
    
    if (result.shouldSave) {
      // 保存してから終了
      const projectData = getCurrentProjectData();
      const saveResult = await window.electronAPI.saveProject(projectData);
      
      if (saveResult.success) {
        markProjectAsSaved();
        return { allowQuit: true };
      } else if (!saveResult.canceled) {
        // 保存に失敗した場合、再度確認
        notifications.error('保存エラー', '保存に失敗しました。');
        return { allowQuit: false };
      } else {
        // 保存がキャンセルされた場合
        return { allowQuit: false };
      }
    }
    
    return { allowQuit: result.allowQuit };
  } catch (error) {
    console.error('終了確認エラー:', error);
    return { allowQuit: true }; // エラー時は終了を許可
  }
};

/**
 * 自動保存ファイルの復元処理
 */
async function handleAutoSaveRestore() {
  try {
    const hasAutoSave = await window.electronAPI.hasAutoSave();
    
    if (hasAutoSave) {
      const autoSaveInfo = await window.electronAPI.getAutoSaveInfo();
      
      if (autoSaveInfo.exists) {
        // 自動的に復元する（ダイアログなし）
        const result = await window.electronAPI.loadAutoSave();
        
        if (result.success && result.data) {
          await loadProjectFromData(result);
          notifications.success('復元完了', '自動保存されたプロジェクトを復元しました');
          markProjectAsModified(); // 自動保存から復元したので変更ありとする
        } else {
          notifications.warning('復元失敗', '自動保存ファイルの読み込みに失敗しました');
        }
      }
    }
  } catch (error) {
    console.error('自動保存復元エラー:', error);
    notifications.warning('復元エラー', '自動保存ファイルの確認中にエラーが発生しました');
  }
}

// プロジェクト管理機能
function saveProject() {
  const projectData = getCurrentProjectData();

  if (window.electronAPI) {
    window.electronAPI.saveProject(projectData)
      .then(result => {
        if (result.success) {
          notifications.success('保存完了', `プロジェクトを保存しました: ${result.filePath}`);
          markProjectAsSaved();
        } else if (result.canceled) {
          // キャンセル時は何も表示しない
        } else {
          notifications.error('保存エラー', result.error);
        }
      })
      .catch(error => {
        notifications.error('保存エラー', error.message);
      });
  } else {
    notifications.error('環境エラー', 'Electron環境でのみ利用可能です');
  }
}

function saveAsProject() {
  const projectData = getCurrentProjectData();

  if (window.electronAPI) {
    window.electronAPI.saveAsProject(projectData)
      .then(result => {
        if (result.success) {
          notifications.success('保存完了', `プロジェクトを保存しました: ${result.filePath}`);
          markProjectAsSaved();
        } else if (result.canceled) {
          // キャンセル時は何も表示しない
        } else {
          notifications.error('保存エラー', result.error);
        }
      })
      .catch(error => {
        notifications.error('保存エラー', error.message);
      });
  } else {
    notifications.error('環境エラー', 'Electron環境でのみ利用可能です');
  }
}

async function loadProject() {
  Logger.info('プロジェクト読み込み開始');
  
  if (window.electronAPI) {
    Logger.debug('Electron API を使用してプロジェクトを読み込み中...');
    
    try {
      const result = await window.electronAPI.loadProject();
      Logger.debug('loadProject結果:', result);
      
      if (result.success) {
        await loadProjectFromData(result);
      } else if (result.canceled) {
        Logger.info('プロジェクト読み込みがキャンセルされました');
      } else {
        Logger.error('プロジェクト読み込みエラー:', result.error);
        notifications.error('読み込みエラー', result.error);
      }
    } catch (error) {
      Logger.error('プロジェクト読み込み例外:', error);
      notifications.error('読み込みエラー', error.message);
    }
  } else {
    Logger.error('Electron API が利用できません');
    notifications.error('環境エラー', 'Electron環境でのみ利用可能です');
  }
}

async function loadProjectFromData(result) {
  try {
    Logger.debug('loadProjectFromData呼び出し:', result);
    
    const projectData = result.data;
    
    if (!projectData) {
      throw new Error('プロジェクトデータが無効です');
    }
    
    Logger.debug('プロジェクトデータ構造:', {
      hasSequences: !!(projectData.sequences),
      sequencesLength: projectData.sequences ? projectData.sequences.length : 0,
      hasFrames: !!(projectData.frames),
      framesLength: projectData.frames ? projectData.frames.length : 0,
      hasSettings: !!(projectData.settings),
      hasImages: !!(projectData.images),
      imagesLength: projectData.images ? projectData.images.length : 0
    });

    // 画像データを復元
    if (projectData.images && Array.isArray(projectData.images)) {
      currentImages = projectData.images;
      Logger.info(`${projectData.images.length}個の画像リソースを復元しました`);
      
      // アプリのベースパスを取得
      const appPath = await window.electronAPI.getAppPath();
      const imagesDir = `${appPath}/images`;
      
      // 保存されたファイルパスから画像を復元
      for (const imageData of projectData.images) {
        // filePathが存在しない場合は自動で生成
        if (!imageData.filePath) {
          imageData.filePath = `${imagesDir}/${imageData.filename}`;
          console.log(`ファイルパスを自動生成: ${imageData.id} -> ${imageData.filePath}`);
        } else {
          // 既存のfilePathをUnix形式（/区切り）に正規化
          imageData.filePath = imageData.filePath.replace(/\\/g, '/');
          console.log(`ファイルパスを正規化: ${imageData.id} -> ${imageData.filePath}`);
        }
        
        if (imageData.filePath) {
          try {
            await imageManager.loadImageFile(imageData.id, imageData.filePath);
            Logger.info(`画像ファイルを復元: ${imageData.id} -> ${imageData.filePath}`);
          } catch (error) {
            Logger.warn(`画像復元失敗: ${imageData.id} (${imageData.filePath})`, error);
            // ファイルが見つからない場合でも処理を続行
          }
        }
      }
    } else {
      currentImages = [];
    }
    
    // フレームデータを復元（新形式と旧形式の両方に対応）
    let frames = [];
    if (projectData.sequences && projectData.sequences.length > 0) {
      // 新形式: sequences[0].frames
      frames = projectData.sequences[0].frames || [];
      Logger.debug('新形式でフレームを読み込み:', frames.length, 'フレーム');
    } else if (projectData.frames && Array.isArray(projectData.frames)) {
      // 旧形式: 直接frames
      frames = projectData.frames;
      Logger.debug('旧形式でフレームを読み込み:', frames.length, 'フレーム');
    }
    
    if (Array.isArray(frames)) {
      currentFrames = frames;
      selectedFrameIndex = -1;
      
      // フレームで使用されている画像をcurrentImagesに追加
      for (const frame of frames) {
        if (frame.imageId) {
          ensureImageInCurrentImages(frame.imageId);
        }
      }
      
      updateFrameSequence();
      Logger.info(`${frames.length}個のフレームを復元しました`);
    }
    
    // 設定を復元
    if (projectData.sequences && projectData.sequences[0]) {
      // 新形式のループ設定
      const loopSetting = projectData.sequences[0].loop || false;
      document.getElementById('loopAnimation').checked = loopSetting;
      Logger.debug('新形式でループ設定を復元:', loopSetting);
    } else if (projectData.settings && projectData.settings.loopAnimation !== undefined) {
      // 旧形式のループ設定
      document.getElementById('loopAnimation').checked = projectData.settings.loopAnimation;
      Logger.debug('旧形式でループ設定を復元:', projectData.settings.loopAnimation);
    }
    
    // プロジェクト読み込み後は保存済み状態にする
    markProjectAsSaved();
    
    // Undo/Redoヒストリーをクリア（新しいプロジェクトとして扱う）
    if (undoRedoManager) {
      undoRedoManager.clearHistory();
    }
    
    // 読み込み完了をログに記録
    if (result.filePath) {
      Logger.info(`プロジェクトを読み込みました: ${result.filePath}`);
    }
  } catch (error) {
    Logger.error('プロジェクト読み込みエラー:', error);
    notifications.error('読み込みエラー', error.message);
  }
}

function newProject() {
  if (currentFrames.length > 0) {
    if (confirm('現在のプロジェクトは保存されていません。新しいプロジェクトを作成しますか？')) {
      resetProject();
    }
  } else {
    resetProject();
  }
}

function newProjectFromData(projectData) {
  try {
    if (currentFrames.length > 0) {
      if (!confirm('現在のプロジェクトは保存されていません。新しいプロジェクトを作成しますか？')) {
        return;
      }
    }
    
    resetProject();
    
    // 新しいプロジェクトデータから初期設定を適用
    if (projectData && projectData.settings) {
      // 将来的に設定を適用する処理をここに追加
      Logger.info('新しいプロジェクトを作成しました:', projectData.name);
    }
  } catch (error) {
    notifications.error('プロジェクト作成エラー', error.message);
  }
}

function resetProject() {
  currentFrames = [];
  currentImages = []; // 画像リソースもクリア
  selectedFrameIndex = -1;
  updateFrameSequence();
  clearInputs(); // 入力フィールドもクリア
  
  // キャンバスをクリア
  if (animationEngine) {
    animationEngine.stopAnimation();
    animationEngine.clearCanvas();
  }
  
  // 設定をリセット
  document.getElementById('loopAnimation').checked = false;
  
  // 編集状態をクリア
  if (editStateTracker) {
    editStateTracker.markAsSaved();
  }
  
  // Undo/Redoヒストリーをクリア
  if (undoRedoManager) {
    undoRedoManager.clearHistory();
  }
}

/**
 * 画像インポートダイアログの設定
 */
function setupImageImportDialog() {
  const dialog = document.getElementById('import-dialog');
  const closeBtn = document.getElementById('import-dialog-close');
  const cancelBtn = document.getElementById('import-cancel-btn');
  const executeBtn = document.getElementById('import-execute-btn');
  const prefixInput = document.getElementById('import-prefix');
  const widthInput = document.getElementById('import-tile-width');
  const heightInput = document.getElementById('import-tile-height');
  const previewImage = document.getElementById('import-preview-image');
  const calcInfo = document.getElementById('import-calc-info');

  // ダイアログを閉じる
  function closeDialog() {
    dialog.style.display = 'none';
    currentImportImagePath = null;
  }

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  // ダイアログ外をクリックして閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeDialog();
    }
  });

  // 設定値が変更されたときの計算情報更新
  function updateCalculationInfo() {
    if (!previewImage.src || !previewImage.naturalWidth) {
      calcInfo.textContent = '画像情報を取得中...';
      return;
    }

    const imageWidth = previewImage.naturalWidth;
    const imageHeight = previewImage.naturalHeight;
    
    // 入力フィールドの最大値を画像サイズに設定
    widthInput.setAttribute('max', imageWidth.toString());
    heightInput.setAttribute('max', imageHeight.toString());
    
    // 現在の値が画像サイズを超えている場合は調整
    if (parseInt(widthInput.value) > imageWidth) {
      widthInput.value = imageWidth.toString();
    }
    if (parseInt(heightInput.value) > imageHeight) {
      heightInput.value = imageHeight.toString();
    }
    
    const tileWidth = parseInt(widthInput.value) || 1;
    const tileHeight = parseInt(heightInput.value) || 1;
    
    const cols = Math.floor(imageWidth / tileWidth);
    const rows = Math.floor(imageHeight / tileHeight);
    const totalTiles = cols * rows;

    calcInfo.innerHTML = `
      元画像: ${imageWidth} × ${imageHeight}px<br>
      分割: ${cols}列 × ${rows}行<br>
      生成されるファイル数: ${totalTiles}個<br>
      ファイル名例: ${prefixInput.value || 'image'}_001.png ～ ${prefixInput.value || 'image'}_${totalTiles.toString().padStart(3, '0')}.png
    `;
  }

  // 入力値変更時の計算情報更新
  [prefixInput, widthInput, heightInput].forEach(input => {
    input.addEventListener('input', updateCalculationInfo);
  });

  // インポート実行
  executeBtn.addEventListener('click', async () => {
    const prefix = prefixInput.value.trim();
    const tileWidth = parseInt(widthInput.value);
    const tileHeight = parseInt(heightInput.value);

    if (!prefix) {
      notifications.warning('入力エラー', 'プレフィックスを入力してください');
      return;
    }

    if (tileWidth <= 0 || tileHeight <= 0) {
      notifications.warning('入力エラー', 'タイルサイズは1以上で入力してください');
      return;
    }

    if (!currentImportImagePath) {
      notifications.error('エラー', '画像パスが設定されていません');
      return;
    }

    try {
      notifications.info('インポート中', '画像を分割してファイルに保存しています...');
      
      const result = await window.electronAPI.splitAndSaveImage({
        imagePath: currentImportImagePath,
        prefix: prefix,
        tileWidth: tileWidth,
        tileHeight: tileHeight
      });

      if (result.success) {
        notifications.success(
          'インポート完了', 
          `${result.totalFiles}個のファイルを保存しました`
        );
        
        // 画像リストを再読み込み
        await imageManager.loadImagesFromDirectory();
        updateImageList();
        
        // プロジェクトデータに画像リソース情報を追加
        await updateProjectDataWithImportedImages(result.savedFiles, prefix);
        
        closeDialog();
      } else {
        notifications.error('インポートエラー', result.error || '不明なエラーが発生しました');
      }
    } catch (error) {
      console.error('インポート実行エラー:', error);
      notifications.error('インポートエラー', error.message);
    }
  });

  // 画像読み込み完了時に計算情報を更新
  previewImage.addEventListener('load', updateCalculationInfo);
}

// 現在インポート中の画像パスを保存
let currentImportImagePath = null;

/**
 * インポートされた画像をプロジェクトデータに追加
 */
async function updateProjectDataWithImportedImages(savedFiles, prefix) {
  try {
    const projectData = getCurrentProjectData();
    if (!projectData) {
      console.warn('プロジェクトデータが見つかりません');
      return;
    }

    // アプリのベースパスを取得
    const appPath = await window.electronAPI.getAppPath();
    const imagesDir = `${appPath}/images`;

    // 保存された画像ファイルをプロジェクトデータに追加
    for (let i = 0; i < savedFiles.length; i++) {
      const filename = savedFiles[i];
      
      // ファイル名から画像IDを抽出（例: test_001.png -> 001）
      const match = filename.match(/_(\d+)\.(png|jpg|jpeg|gif)$/i);
      if (match) {
        const imageId = match[1];
        
        // 既存の画像リソースがあるかチェック
        const existingImage = currentImages.find(img => img.id === imageId);
        if (!existingImage) {
          // 完全なファイルパスを構築
          const fullFilePath = `${imagesDir}/${filename}`;
          
          // 新しい画像リソースを追加（filePathを含む）
          const imageResource = {
            id: imageId,
            filename: filename,
            filePath: fullFilePath, // 正しいファイルパスを設定
            width: 32, // デフォルトサイズ（実際のサイズは後で更新される）
            height: 24
          };
          
          currentImages.push(imageResource);
          console.log(`プロジェクトに画像リソースを追加: ${imageId} -> ${filename} (${fullFilePath})`);
        } else {
          // 既存の画像のfilePathを更新
          const fullFilePath = `${imagesDir}/${filename}`;
          existingImage.filePath = fullFilePath;
          console.log(`既存画像のファイルパスを更新: ${imageId} -> ${fullFilePath}`);
        }
      }
    }

    // 変更をマーク
    if (editStateTracker) {
      editStateTracker.markAsModified();
    }
    
    Logger.info(`${savedFiles.length}個の画像リソースをプロジェクトに追加しました`);
    
  } catch (error) {
    console.error('プロジェクトデータ更新エラー:', error);
  }
}

/**
 * 画像インポート処理
 */
async function handleImageImport(imagePath) {
  try {
    currentImportImagePath = imagePath;
    
    const dialog = document.getElementById('import-dialog');
    const previewImage = document.getElementById('import-preview-image');
    
    // プレビュー画像を設定
    previewImage.src = `file:///${imagePath.replace(/\\/g, '/')}`;
    
    // ダイアログを表示
    dialog.style.display = 'flex';
    
    Logger.info('画像インポートダイアログを表示:', imagePath);
  } catch (error) {
    console.error('画像インポート処理エラー:', error);
    notifications.error('インポートエラー', '画像インポート処理でエラーが発生しました');
  }
}

/**
 * Undo操作を実行
 */
function performUndo() {
  if (!undoRedoManager) {
    console.warn('UndoRedoManagerが初期化されていません');
    return;
  }

  if (!undoRedoManager.canUndo()) {
    return;
  }

  const success = undoRedoManager.undo();
  
  if (success && editStateTracker) {
    editStateTracker.markAsModified();
  }
}

/**
 * Redo操作を実行
 */
function performRedo() {
  if (!undoRedoManager) {
    console.warn('UndoRedoManagerが初期化されていません');
    return;
  }

  if (!undoRedoManager.canRedo()) {
    return;
  }

  const success = undoRedoManager.redo();
  
  if (success && editStateTracker) {
    editStateTracker.markAsModified();
  }
}

/**
 * Undo/RedoのUI状態を更新
 */
function updateUndoRedoUI(canUndo, canRedo) {
  // ボタンの有効/無効を設定
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  
  if (undoBtn) {
    undoBtn.disabled = !canUndo;
    if (canUndo && undoRedoManager) {
      const undoDesc = undoRedoManager.getUndoDescription();
      undoBtn.title = undoDesc ? `元に戻す: ${undoDesc} (Ctrl+Z)` : '元に戻す (Ctrl+Z)';
    } else {
      undoBtn.title = '元に戻す (Ctrl+Z)';
    }
  }
  
  if (redoBtn) {
    redoBtn.disabled = !canRedo;
    if (canRedo && undoRedoManager) {
      const redoDesc = undoRedoManager.getRedoDescription();
      redoBtn.title = redoDesc ? `やり直し: ${redoDesc} (Ctrl+Y)` : 'やり直し (Ctrl+Y)';
    } else {
      redoBtn.title = 'やり直し (Ctrl+Y)';
    }
  }
  
  // ステータスバーにUndo/Redoの状態を表示
  if ((canUndo || canRedo) && notifications) {
    const undoDesc = undoRedoManager ? undoRedoManager.getUndoDescription() : null;
    const redoDesc = undoRedoManager ? undoRedoManager.getRedoDescription() : null;
    
    let statusText = '';
    if (canUndo && undoDesc) {
      statusText += `Undo可能: ${undoDesc}`;
    }
    if (canRedo && redoDesc) {
      if (statusText) statusText += ' | ';
      statusText += `Redo可能: ${redoDesc}`;
    }
    
    if (statusText) {
      notifications.showStatus(statusText, 'info', 2000);
    }
  }
}

/**
 * フレーム選択を上下に移動
 */
function moveFrameSelection(direction) {
  if (currentFrames.length === 0) return;
  
  let newIndex;
  if (selectedFrameIndex === -1) {
    // 何も選択されていない場合は最初/最後を選択
    newIndex = direction > 0 ? 0 : currentFrames.length - 1;
  } else {
    newIndex = selectedFrameIndex + direction;
    // 範囲チェック（循環しない）
    if (newIndex < 0) newIndex = 0; // 最初で止まる
    if (newIndex >= currentFrames.length) newIndex = currentFrames.length - 1; // 最後で止まる
  }
  
  // 移動しない場合は処理を終了
  if (newIndex === selectedFrameIndex) return;
  
  selectedFrameIndex = newIndex;
  updateFrameSequence();
  loadFrameToInputs(selectedFrameIndex);
  
  // 一時停止中またはアニメーション再生中にフレーム選択を移動した場合、
  // アニメーションの再生位置もそのフレームに移動
  if ((isPaused || animationPlaybackActive || syncPlaybackActive) && 
      animationEngine && 
      animationEngine.getAnimationState().sequence) {
    animationEngine.seekToFrame(selectedFrameIndex);
    
    // 動画が読み込まれている場合は動画位置も同期
    if (currentVideoElement) {
      syncVideoToFrame(selectedFrameIndex);
    }
  }
}

/**
 * 選択されたフレームを画面内に表示
 */
function scrollToSelectedFrame() {
  if (selectedFrameIndex === -1) return;
  
  const frameSequence = document.getElementById('frameSequence');
  const selectedFrame = frameSequence.querySelector('.frame-item.selected');
  
  if (selectedFrame && frameSequence) {
    selectedFrame.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }
}

/**
 * 選択されたフレームを上下に移動
 */
function moveSelectedFrame(direction) {
  if (selectedFrameIndex === -1 || currentFrames.length <= 1) return;
  
  const newIndex = selectedFrameIndex + direction;
  
  // 範囲チェック
  if (newIndex < 0 || newIndex >= currentFrames.length) return;
  
  // moveFrame関数を使用してUndo/Redo機能と連携
  moveFrame(selectedFrameIndex, direction);
}

/**
 * フレーム編集エリアにフォーカスを移動
 */
function focusFrameEditor() {
  const xPositionInput = document.getElementById('xPosition');
  if (xPositionInput) {
    xPositionInput.focus();
    xPositionInput.select(); // 入力値を全選択
  }
}

/**
 * フレームシーケンスエリアにフォーカスを移動
 */
function focusFrameSequence() {
  const frameSequence = document.getElementById('frameSequence');
  if (frameSequence) {
    frameSequence.focus();
    // 選択されたフレームを画面内に表示
    scrollToSelectedFrame();
  }
}
function addActionToHistory(type, description, executeCallback, undoCallback) {
  if (!undoRedoManager) {
    console.warn('UndoRedoManagerが初期化されていません');
    return;
  }

  const action = new BaseAction(type, description, executeCallback, undoCallback);
  undoRedoManager.addToHistory(action);
  
  if (editStateTracker) {
    editStateTracker.markAsModified();
  }
}

// グローバル関数として公開
window.getCurrentProjectData = getCurrentProjectData;
window.loadProjectData = loadProjectData;

/**
 * Z80コードエクスポート機能（簡略版）
 */
async function exportZ80Code() {
  try {
    Logger.info('Z80エクスポート開始');
    notifications.info('エクスポート開始', 'Z80コードを生成中...');
    
    // 現在のプロジェクトデータを取得
    const projectData = getCurrentProjectData();
    
    console.log('エクスポート用プロジェクトデータ:', {
      name: projectData.name,
      imagesCount: projectData.images ? projectData.images.length : 0,
      sequencesCount: projectData.sequences ? projectData.sequences.length : 0,
      images: projectData.images
    });
    
    if (!projectData) {
      notifications.error('エクスポートエラー', 'プロジェクトデータが見つかりません');
      return;
    }
    
    // プロジェクトに有効なデータがあるかチェック
    if (!projectData.sequences || projectData.sequences.length === 0) {
      notifications.warning('エクスポート注意', 'アニメーションシーケンスが定義されていません。\nシーケンスを作成してからエクスポートしてください。');
      Logger.info('Z80エクスポートを中止（シーケンスなし）');
      return;
    }
    
    notifications.info('エクスポート開始', 'Z80コードを生成中...');
    
    // メインプロセスでエクスポート実行（オプションなし）
    const result = await window.electronAPI.exportZ80(projectData);
    
    if (result.success) {
      Logger.info('Z80エクスポート完了:', result);
      notifications.success(
        'エクスポート完了', 
        `Z80コードが正常にエクスポートされました\n` +
        `ファイル: ${result.outputPath ? result.outputPath.split('\\').pop() : '?'}\n` +
        `行数: ${result.linesGenerated || 0}行\n` +
        `サイズ: ${result.sizeBytes || 0}バイト`
      );
    } else if (result.canceled) {
      Logger.info('Z80エクスポートがキャンセルされました');
      notifications.info('エクスポートキャンセル', 'Z80エクスポートがキャンセルされました');
    } else {
      Logger.error('Z80エクスポートエラー:', result.error);
      notifications.error('エクスポートエラー', result.error || '不明なエラーが発生しました');
    }
    
  } catch (error) {
    Logger.error('Z80エクスポート実行エラー:', error);
    notifications.error('エクスポートエラー', 'Z80エクスポート中にエラーが発生しました');
  }
}

/**
 * フレーム情報の表示を更新
 * @param {Object|null} frameInfo - フレーム情報（nullの場合は非表示）
 */
function updateFrameInfo(frameInfo) {
  const frameInfoElement = document.getElementById('frameInfo');
  const currentFrameDisplay = document.getElementById('currentFrameDisplay');
  
  if (!frameInfoElement || !currentFrameDisplay) {
    return;
  }
  
  if (frameInfo) {
    // フレーム情報を表示
    const frameNumber = frameInfo.frameIndex + 1; // 1ベースで表示
    const displayText = `${frameNumber}/${frameInfo.totalFrames} (X:${frameInfo.x}, Y:${frameInfo.y}, W:${frameInfo.waitTime})`;
    
    currentFrameDisplay.textContent = displayText;
    frameInfoElement.style.display = 'block';
  } else {
    // フレーム情報を非表示
    frameInfoElement.style.display = 'none';
  }
}

window.performUndo = performUndo;
window.performRedo = performRedo;
window.addActionToHistory = addActionToHistory;
window.getCurrentProjectData = getCurrentProjectData;
