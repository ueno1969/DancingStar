import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { ProjectData } from './types/project';
import { ProjectManager } from './project-manager';
import { AutoSaveManager } from './autosave-manager';
import { ConfigManager } from './config-manager';
import { Z80Exporter } from './z80-exporter';
import { SemiGraphicConverter } from './semi-graphic-converter';
import { CliImageLoader } from './cli-image-loader';

let mainWindow: BrowserWindow;
let projectManager: ProjectManager;
let autoSaveManager: AutoSaveManager;
let configManager: ConfigManager;
let semiGraphicConverter: SemiGraphicConverter;
let currentProjectDataGetter: (() => Promise<ProjectData>) | null = null;

function createWindow(): void {
  // メインウィンドウを作成
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  // index.htmlをロード
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // ウィンドウが準備できたら表示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 開発時はDevToolsを開く
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// このメソッドは、Electronが初期化を終了し、
// ブラウザウィンドウを作成する準備ができたときに呼ばれる
app.whenReady().then(() => {
  createWindow();
  
  // 設定マネージャーを初期化
  configManager = new ConfigManager();
  
  // プロジェクトマネージャーを初期化
  projectManager = new ProjectManager(mainWindow);
  
  // 自動保存マネージャーを初期化
  const autoSaveInterval = configManager.get('autoSaveInterval');
  autoSaveManager = new AutoSaveManager(autoSaveInterval);
  
  // セミグラフィックコンバーターを初期化
  semiGraphicConverter = new SemiGraphicConverter();
  
  setupIpcHandlers();
  createMenu();
  
  // アプリ起動時に自動保存ファイルの確認
  checkAutoSaveOnStartup();
});

// アプリケーションメニューを作成
function createMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: '新しいプロジェクト',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const newProject = projectManager.createNewProject();
            mainWindow.webContents.send('menu-new-project', newProject);
            // 新しいプロジェクトなので現在のパスはnull
            mainWindow.webContents.send('project-path-changed', null);
          }
        },
        {
          label: 'プロジェクトを開く...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await projectManager.loadProject();
            if (result.success) {
              mainWindow.webContents.send('menu-load-project', result);
              // プロジェクトが読み込まれたのでパスを通知
              mainWindow.webContents.send('project-path-changed', result.filePath);
            } else if (result.error) {
              projectManager.showError('読み込みエラー', result.error);
            }
          }
        },
        {
          label: 'プロジェクトを保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save-project');
          }
        },
        {
          label: '名前をつけて保存...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-save-as-project');
          }
        },
        { type: 'separator' },
        {
          label: 'エクスポート',
          submenu: [
            {
              label: 'Z80コード',
              accelerator: 'CmdOrCtrl+E',
              click: () => {
                mainWindow.webContents.send('menu-export-z80');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: '画像をインポート...',
          accelerator: 'CmdOrCtrl+I',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '画像をインポート',
              filters: [
                { name: 'PNG画像', extensions: ['png'] },
                { name: 'すべての画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }
              ],
              properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-import-image', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: '終了',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '編集',
      submenu: [
        {
          label: '元に戻す',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            mainWindow.webContents.send('menu-undo');
          }
        },
        {
          label: 'やり直し',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y',
          click: () => {
            mainWindow.webContents.send('menu-redo');
          }
        },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { type: 'separator' },
        {
          label: 'フレーム選択を上に移動',
          accelerator: 'Up',
          click: () => {
            mainWindow.webContents.send('frame-select-up');
          }
        },
        {
          label: 'フレーム選択を下に移動',
          accelerator: 'Down',
          click: () => {
            mainWindow.webContents.send('frame-select-down');
          }
        },
        {
          label: 'フレームを上に移動',
          accelerator: 'Shift+Up',
          click: () => {
            mainWindow.webContents.send('frame-move-up');
          }
        },
        {
          label: 'フレームを下に移動',
          accelerator: 'Shift+Down',
          click: () => {
            mainWindow.webContents.send('frame-move-down');
          }
        }
      ]
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全画面表示' }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'Z80 Dancing Editor DancingStar について',
          click: () => {
            // アバウトダイアログを表示
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Z80 Dancing Editor DancingStar について',
              message: 'Z80 Dancing Editor DancingStar',
              detail: 'Version 1.0.0\nZ80用アニメーション制作ツール'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC通信のハンドラーを設定
function setupIpcHandlers() {
  // プロジェクト保存
  ipcMain.handle('save-project', async (_event, projectData: ProjectData) => {
    const result = await projectManager.saveProject(projectData);
    if (result.success && result.filePath) {
      // 保存成功時にパス変更を通知
      mainWindow.webContents.send('project-path-changed', result.filePath);
    }
    return result;
  });

  // プロジェクトを名前をつけて保存
  ipcMain.handle('save-as-project', async (_event, projectData: ProjectData) => {
    const result = await projectManager.saveAsProject(projectData);
    if (result.success && result.filePath) {
      // 保存成功時にパス変更を通知
      mainWindow.webContents.send('project-path-changed', result.filePath);
    }
    return result;
  });

  // プロジェクト読み込み
  ipcMain.handle('load-project', async () => {
    const result = await projectManager.loadProject();
    if (result.success && result.filePath) {
      // 読み込み成功時にパス変更を通知
      mainWindow.webContents.send('project-path-changed', result.filePath);
    }
    return result;
  });

  // 新しいプロジェクト作成
  ipcMain.handle('new-project', async () => {
    const result = projectManager.createNewProject();
    // 新しいプロジェクトなので現在のパスはnull
    mainWindow.webContents.send('project-path-changed', null);
    return result;
  });

  // Undo/Redo操作
  ipcMain.handle('undo', async () => {
    // レンダラープロセスでUndo処理を行う
    mainWindow.webContents.send('perform-undo');
    return { success: true };
  });

  ipcMain.handle('redo', async () => {
    // レンダラープロセスでRedo処理を行う
    mainWindow.webContents.send('perform-redo');
    return { success: true };
  });

  // 自動保存関連
  ipcMain.handle('start-autosave', async (_event, projectData: ProjectData) => {
    console.log('自動保存開始要求を受信:', projectData);
    
    // レンダラープロセスから最新のプロジェクトデータを取得する関数を設定
    currentProjectDataGetter = async () => {
      try {
        const latestData = await mainWindow.webContents.executeJavaScript(`
          (function() {
            if (typeof getCurrentProjectData === 'function') {
              return getCurrentProjectData();
            }
            return null;
          })()
        `);
        console.log('レンダラーから取得したプロジェクトデータ:', latestData);
        return latestData || projectData; // フォールバックとして初期データを使用
      } catch (error) {
        console.error('プロジェクトデータ取得エラー:', error);
        return projectData; // エラー時は初期データを使用
      }
    };
    
    // プロジェクトパスを取得する関数を設定
    const currentProjectPathGetter = () => {
      return projectManager.getCurrentFilePath();
    };
    
    // 自動保存を開始（プロジェクトパス取得関数も渡す）
    if (currentProjectDataGetter) {
      autoSaveManager.startAutoSave(currentProjectDataGetter, currentProjectPathGetter);
    }
    return { success: true };
  });

  ipcMain.handle('stop-autosave', async () => {
    autoSaveManager.stopAutoSave();
    return { success: true };
  });

  ipcMain.handle('has-autosave', async () => {
    return autoSaveManager.hasAutoSaveFile();
  });

  ipcMain.handle('get-autosave-info', async () => {
    return autoSaveManager.getAutoSaveInfo();
  });

  ipcMain.handle('load-autosave', async () => {
    const result = await autoSaveManager.loadAutoSave();
    if (result) {
      return { 
        success: true, 
        data: result.projectData,
        projectPath: result.projectPath
      };
    } else {
      return { success: false };
    }
  });

  ipcMain.handle('clear-autosave', async () => {
    autoSaveManager.clearAutoSave();
    return { success: true };
  });

  // 手動自動保存
  ipcMain.handle('save-autosave-now', async (_event, projectData: ProjectData) => {
    try {
      const currentPath = projectManager.getCurrentFilePath();
      await autoSaveManager.saveNow(projectData, currentPath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });
  
  // 設定値の取得
  ipcMain.handle('get-config-value', async (_event, key: string) => {
    // 特定のキーのみ許可
    if (configManager && ['autoSaveInterval', 'canvasWidth', 'canvasHeight', 'defaultFrameRate', 
                          'backgroundColor', 'maxRecentProjects', 'zoomLevels'].includes(key)) {
      return configManager.get(key as any);
    }
    return null;
  });
  
  // アプリケーションのルートパスを取得
  ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
  });
  
  // 現在のプロジェクトファイルパスを取得
  ipcMain.handle('get-current-project-path', () => {
    return projectManager.getCurrentFilePath();
  });
  
  // ファイルダイアログを開く
  ipcMain.handle('open-file-dialog', async (_event, options: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || 'ファイルを選択',
        filters: options.filters || [{ name: 'すべてのファイル', extensions: ['*'] }],
        properties: (options.properties as any) || ['openFile']
      });
      
      return {
        canceled: result.canceled,
        filePaths: result.filePaths
      };
    } catch (error) {
      console.error('ファイルダイアログエラー:', error);
      return {
        canceled: true,
        filePaths: []
      };
    }
  });
  
  // 指定されたディレクトリ内の画像ファイル一覧を取得
  ipcMain.handle('list-image-files', async (_event, dirPath: string) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // アプリケーションルートからの相対パスを絶対パスに変換
      const appPath = app.getAppPath();
      const absolutePath = path.join(appPath, dirPath);
      
      console.log(`画像ディレクトリをスキャン中: ${absolutePath}`);
      
      if (!fs.existsSync(absolutePath)) {
        console.warn(`ディレクトリが見つかりません: ${absolutePath}`);
        return [];
      }
      
      const files = fs.readdirSync(absolutePath);
      return files;
    } catch (error) {
      console.error('ディレクトリ読み込みエラー:', error);
      return [];
    }
  });
  
  // 画像インポートダイアログを表示
  ipcMain.handle('show-import-dialog', async (_event, imagePath: string) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '画像インポート設定',
      message: '画像分割の設定を行ってください',
      detail: '以下のボタンをクリックして設定画面を開きます',
      buttons: ['設定', 'キャンセル'],
      defaultId: 0
    });

    if (result.response === 0) {
      // 設定画面を開く
      return { showSettings: true, imagePath };
    }
    return { showSettings: false };
  });

  // 画像を分割してファイルに保存
  ipcMain.handle('split-and-save-image', async (_event, options: {
    imagePath: string;
    prefix: string;
    tileWidth: number;
    tileHeight: number;
  }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { nativeImage } = require('electron');

      console.log('画像分割開始:', options);

      // 画像を読み込み
      const image = nativeImage.createFromPath(options.imagePath);
      const size = image.getSize();
      
      console.log(`元画像サイズ: ${size.width}x${size.height}`);

      const { tileWidth, tileHeight, prefix } = options;
      const cols = Math.floor(size.width / tileWidth);
      const rows = Math.floor(size.height / tileHeight);
      
      console.log(`分割: ${cols}列 x ${rows}行 = ${cols * rows}個のタイル`);

      // 出力ディレクトリの準備
      const appPath = app.getAppPath();
      const outputDir = path.join(appPath, 'images');
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const savedFiles: string[] = [];
      let tileIndex = 1;

      // 画像を分割して保存
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // 切り抜き領域を計算
          const sourceX = col * tileWidth;
          const sourceY = row * tileHeight;
          
          // nativeImageで指定領域を切り抜き
          const croppedImage = image.crop({
            x: sourceX,
            y: sourceY,
            width: tileWidth,
            height: tileHeight
          });

          // ファイル名を生成（3桁0埋め）
          const filename = `${prefix}_${tileIndex.toString().padStart(3, '0')}.png`;
          const filepath = path.join(outputDir, filename);

          // PNGとして保存
          const buffer = croppedImage.toPNG();
          fs.writeFileSync(filepath, buffer);
          
          savedFiles.push(filename);
          tileIndex++;
        }
      }

      console.log(`分割完了: ${savedFiles.length}個のファイルを保存`);
      return { 
        success: true, 
        savedFiles, 
        totalFiles: savedFiles.length,
        outputDir 
      };

    } catch (error) {
      console.error('画像分割エラー:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  // アプリケーション終了前の確認
  ipcMain.handle('confirm-quit', async (_event, hasUnsavedChanges: boolean) => {
    if (!hasUnsavedChanges) {
      return { allowQuit: true };
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['保存して終了', '保存せずに終了', 'キャンセル'],
      defaultId: 0,
      title: '未保存の変更があります',
      message: 'プロジェクトに未保存の変更があります。',
      detail: 'どのように処理しますか？'
    });

    return {
      allowQuit: result.response !== 2, // キャンセル以外は終了を許可
      shouldSave: result.response === 0 // "保存して終了"が選択された場合
    };
  });

  // Z80コードエクスポート機能
  ipcMain.handle('export-z80-code', async (_event, projectData: ProjectData) => {
    try {
      console.log('Z80エクスポート開始');
      console.log('受信したプロジェクトデータ:', {
        name: projectData.name,
        imagesCount: projectData.images ? projectData.images.length : 0,
        sequencesCount: projectData.sequences ? projectData.sequences.length : 0,
        images: projectData.images
      });
      
      // 出力ファイルの選択ダイアログを表示
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Z80アセンブリコードをエクスポート',
        defaultPath: `${projectData.name || 'project'}.asm`,
        filters: [
          { name: 'アセンブリファイル', extensions: ['asm'] },
          { name: 'テキストファイル', extensions: ['txt'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      // 画像が含まれている場合は、画像データを読み込み
      if (projectData.images && projectData.images.length > 0) {
        console.log('プロジェクト内の画像を読み込み中...');
        const imageLoader = new CliImageLoader();
        
        for (const imageResource of projectData.images) {
          if (!imageResource.imageElement) {
            console.log(`  - ${imageResource.filename} (ID: ${imageResource.id})`);
            
            let imagePath: string | null = null;
            
            // 保存されたfilePathを優先的に使用
            if (imageResource.filePath && require('fs').existsSync(imageResource.filePath)) {
              imagePath = imageResource.filePath;
              console.log(`    保存されたパスを使用: ${imagePath}`);
            } else {
              // filePathがない場合、または存在しない場合は従来の方法で検索
              console.log(`    保存されたパスが無効、検索中: ${imageResource.filePath || 'パスなし'}`);
              const appPath = app.getAppPath();
              imagePath = imageLoader.findImageFile(appPath, imageResource.filename);
              if (imagePath) {
                console.log(`    検索で発見: ${imagePath}`);
              }
            }
            
            if (imagePath) {
              const imageData = await imageLoader.loadImage(imagePath);
              if (imageData) {
                // HTMLImageElementに相当するオブジェクトを作成
                const mockImageElement: any = {
                  width: imageData.width,
                  height: imageData.height,
                  getImageData: () => ({
                    width: imageData.width,
                    height: imageData.height,
                    data: imageData.data
                  })
                };
                
                imageResource.imageElement = mockImageElement;
                console.log(`    読み込み完了: ${imageData.width}x${imageData.height}`);
              } else {
                console.warn(`    警告: 画像の読み込みに失敗: ${imageResource.filename}`);
              }
            } else {
              console.warn(`    警告: 画像ファイルが見つかりません: ${imageResource.filename}`);
            }
          }
        }
      }

      // Z80エクスポーターを使用してコードを生成
      const exporter = new Z80Exporter();
      const exportResult = await exporter.exportProject(projectData, {
        outputPath: result.filePath
      });

      if (exportResult.success) {
        // 成功メッセージを表示
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'エクスポート完了',
          message: 'Z80アセンブリコードのエクスポートが完了しました',
          detail: `出力ファイル: ${exportResult.outputPath}\n生成行数: ${exportResult.linesGenerated}行\nファイルサイズ: ${exportResult.sizeBytes}バイト`
        });

        return {
          success: true,
          outputPath: exportResult.outputPath,
          linesGenerated: exportResult.linesGenerated,
          sizeBytes: exportResult.sizeBytes
        };
      } else {
        // エラーメッセージを表示
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'エクスポートエラー',
          message: 'Z80アセンブリコードのエクスポートに失敗しました',
          detail: exportResult.error || '不明なエラー'
        });

        return {
          success: false,
          error: exportResult.error
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Z80エクスポートエラー:', errorMessage);
      
      // エラーメッセージを表示
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'エクスポートエラー',
        message: 'Z80エクスポート中に予期しないエラーが発生しました',
        detail: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  });

  // セミグラフィック変換機能
  ipcMain.handle('convert-image-to-semi-graphic', async (_event, projectData: ProjectData, imageId: string) => {
    try {
      const semiData = await semiGraphicConverter.convertImageFromProject(projectData, imageId);
      if (semiData) {
        const stats = semiGraphicConverter.getStatistics(semiData);
        console.log(`セミグラフィック変換完了: ${imageId}`);
        console.log(`元画像サイズ: ${semiData.width*2}x${semiData.height*4}ピクセル`);
        console.log(`セミグラブロック: ${semiData.width}x${semiData.height}`);
        console.log(`使用色数: ${stats.usedColors.length}, 非空ブロック: ${stats.nonEmptyBlocks}`);
        
        return { 
          success: true, 
          data: semiData,
          stats: stats
        };
      } else {
        return { success: false, error: 'セミグラフィック変換に失敗しました' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('セミグラフィック変換エラー:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // 画像ファイルからセミグラフィック変換
  ipcMain.handle('convert-image-file-to-semi-graphic', async (_event, imagePath: string) => {
    try {
      const semiData = await semiGraphicConverter.convertImageFile(imagePath);
      if (semiData) {
        const stats = semiGraphicConverter.getStatistics(semiData);
        console.log(`セミグラフィック変換完了: ${imagePath}`);
        console.log(`元画像サイズ: ${semiData.width*2}x${semiData.height*4}ピクセル`);
        console.log(`セミグラブロック: ${semiData.width}x${semiData.height}`);
        console.log(`使用色数: ${stats.usedColors.length}, 非空ブロック: ${stats.nonEmptyBlocks}`);
        
        return { 
          success: true, 
          data: semiData,
          stats: stats
        };
      } else {
        return { success: false, error: 'セミグラフィック変換に失敗しました' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('セミグラフィック変換エラー:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });
}

// すべてのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
  // macOS以外では、アプリケーションを終了する
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリ終了前の処理
app.on('before-quit', async (event) => {
  // メインウィンドウにアプリ終了の確認を求める
  if (mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    
    try {
      const response = await mainWindow.webContents.executeJavaScript(`
        window.handleAppQuit ? window.handleAppQuit() : Promise.resolve({ allowQuit: true })
      `);
      
      if (response.allowQuit) {
        // 自動保存を停止してクリーンアップ
        if (autoSaveManager) {
          autoSaveManager.stopAutoSave();
        }
        
        // 強制終了
        app.exit();
      }
    } catch (error) {
      console.error('アプリ終了確認エラー:', error);
      // エラーが発生した場合は強制終了
      app.exit();
    }
  }
});

app.on('activate', () => {
  // macOSでdockアイコンがクリックされ、他のウィンドウが開いていない場合
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * アプリ起動時に自動保存ファイルがあるかチェック
 */
async function checkAutoSaveOnStartup(): Promise<void> {
  if (autoSaveManager.hasAutoSaveFile()) {
    const info = autoSaveManager.getAutoSaveInfo();
    
    // 自動保存ファイルが存在する場合は自動的に復元
    const autoSaveResult = await autoSaveManager.loadAutoSave();
    if (autoSaveResult) {
      console.log('自動保存ファイルを復元しています:', info.savedAt?.toLocaleString() || '不明');
      console.log('復元するプロジェクトパス:', autoSaveResult.projectPath);
      
      // プロジェクトパスがある場合はProjectManagerに設定
      if (autoSaveResult.projectPath) {
        // 内部的にプロジェクトパスを設定（読み込み処理をシミュレート）
        (projectManager as any).currentFilePath = autoSaveResult.projectPath;
        // レンダラープロセスにプロジェクトパス変更を通知
        mainWindow.webContents.send('project-path-changed', autoSaveResult.projectPath);
      }
      
      mainWindow.webContents.send('restore-autosave', {
        projectData: autoSaveResult.projectData,
        projectPath: autoSaveResult.projectPath
      });
    } else {
      console.warn('自動保存ファイルの読み込みに失敗しました');
    }
  }
}
