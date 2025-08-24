/**
 * 簡易版画像管理クラス（ブラウザ環境用）
 * 注意: 将来的にはTypeScriptのImageManagerクラスに統一予定
 */
class SimpleImageManager {
  constructor() {
    this.images = new Map();
    this.loadedImages = new Map();
  }

  /**
   * 実際のimagesディレクトリからPNG画像を読み込む
   */
  async loadImagesFromDirectory() {
    try {
      // imagesディレクトリのパスを取得（プロジェクトルート直下）
      const imagesPath = 'images';
      
      console.log('画像を読み込み中:', imagesPath);
      
      // アプリケーションのルートパスを確認（デバッグ用）
      const appPath = window.electronAPI.getAppPath();
      console.log('アプリケーションのルートパス:', appPath);
      
      // ipcRendererを使用して画像ファイルの一覧を取得
      const files = await window.electronAPI.listImageFiles(imagesPath);
      console.log('見つかった画像ファイル:', files);
      
      // PNG、JPG、GIF画像をフィルタリング
      const imageFiles = files.filter(file => 
        file.match(/\.(png|jpg|jpeg|gif)$/i)
      );
      
      console.log('フィルタリング後の画像ファイル:', imageFiles);
      
      for (const filename of imageFiles) {
        // ファイル名からIDを抽出（例：ropoko_001.png -> 001）
        const match = filename.match(/_(\d+)\.(png|jpg|jpeg|gif)$/i);
        console.log(`ファイル名パターンマッチ: ${filename} -> ${match ? match[1] : 'マッチしない'}`);
        if (match) {
          const id = match[1];
          console.log(`画像を読み込み: ${filename}, ID: ${id}`);
          
          try {
            // 正しい画像パスを構築（相対パスではなく絶対パスを使用）
            if (window.electronAPI) {
              // getAppPathはPromiseを返すため、await で解決する必要がある
              const appPath = await window.electronAPI.getAppPath();
              
              // Windowsパスを適切に処理
              const path = window.require ? window.require('path') : { join: (a, b, c) => `${a}/${b}/${c}` };
              const fullPath = path.join(appPath, imagesPath, filename).replace(/\\/g, '/');
              
              console.log(`画像の絶対パスを構築: ${fullPath}`);
              await this.loadImageFile(id, fullPath);
            } else {
              await this.loadImageFile(id, `${imagesPath}/${filename}`);
            }
          } catch (err) {
            console.error(`画像 ${id} の読み込み中にエラーが発生しました:`, err);
          }
        }
      }
      
      if (this.images.size === 0) {
        console.log('画像ファイルが見つかりませんでした');
      }
    } catch (error) {
      console.error('画像読み込みエラー:', error);
    }
  }
  
  /**
   * 指定された画像ファイルを読み込む
   */
  async loadImageFile(id, imagePath) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.set(id, img);
        
        // リソース情報を登録
        const resource = {
          id,
          filename: imagePath.split('/').pop(),
          filePath: imagePath, // ファイルパスを保存
          width: img.naturalWidth || 72,
          height: img.naturalHeight || 88,
          imageElement: img
        };
        this.images.set(id, resource);
        console.log(`画像を正常に読み込みました: ${id}`, img.src);
        resolve(resource);
      };
      img.onerror = (err) => {
        console.error(`画像読み込みに失敗: ${imagePath}`, err);
        // エラーの詳細情報を表示
        console.error(`画像のパス: ${img.src}`);
        console.error(`エラーオブジェクト:`, err);
        resolve(null); // 処理は継続
      };
      
      // 画像パスを適切に設定（file://プロトコルを使用）
      // Electronの環境では、絶対パスで指定する必要がある
      if (window.electronAPI) {
        // パスが既に絶対パスの場合はそのまま使用
        // 絶対パスに変換済みのはずなので、単純にプロトコルを追加する
        
        // file:// プロトコルを追加して絶対パスとして設定
        // Windowsのパス区切り文字をURLに適したスラッシュに変換
        const urlPath = imagePath.replace(/\\/g, '/');
        img.src = `file:///${urlPath}`;
        console.log(`最終的な画像パス: ${img.src}`);
      } else {
        img.src = imagePath;
      }
    });
  }

  getImage(id) {
    return this.images.get(id);
  }

  getImageElement(id) {
    return this.loadedImages.get(id);
  }

  getImageList() {
    return Array.from(this.images.values());
  }

  isImageLoaded(id) {
    return this.loadedImages.has(id);
  }
}
