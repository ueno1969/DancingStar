import { ImageResource } from './types/project';

export class ImageManager {
  private images: Map<string, ImageResource> = new Map();
  private loadedImages: Map<string, HTMLImageElement> = new Map();

  /**
   * 画像ディレクトリから画像ファイルを読み込み
   */
  async loadImagesFromDirectory(directoryPath: string): Promise<void> {
    try {
      // Electronのファイルシステムアクセス
      const fs = window.require('fs');
      const path = window.require('path');
      
      const files = fs.readdirSync(directoryPath);
      const imageFiles = files.filter((file: string) => 
        file.match(/\.(png|jpg|jpeg|gif)$/i) && file.match(/_(\d+)\.(png|jpg|jpeg|gif)$/i)
      );

      // 画像ファイルがない場合は何もしない
      if (imageFiles.length === 0) {
        console.log('No image files found in directory:', directoryPath);
        return;
      }

      for (const filename of imageFiles) {
        const match = filename.match(/_(\d+)\.(png|jpg|jpeg|gif)$/i);
        if (match) {
          const id = match[1];
          const fullPath = path.join(directoryPath, filename);
          
          const imageResource: ImageResource = {
            id,
            filename,
            filePath: fullPath, // ファイルパスを保存
            width: 72,
            height: 88
          };
          
          this.images.set(id, imageResource);
          await this.loadImage(id, fullPath);
        }
      }
    } catch (error) {
      console.error('Failed to load images:', error);
      // 画像ディレクトリにアクセスできない場合も何もしない
    }
  }

  /**
   * 個別画像の読み込み
   */
  private async loadImage(id: string, imagePath: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.set(id, img);
        const resource = this.images.get(id);
        if (resource) {
          resource.imageElement = img;
          resource.width = img.naturalWidth;
          resource.height = img.naturalHeight;
        }
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${imagePath}`);
        // 画像の読み込みに失敗した場合は何もしない
        resolve();
      };
      img.src = `file://${imagePath}`;
    });
  }

  /**
   * 画像リソースを取得
   */
  getImage(id: string): ImageResource | undefined {
    return this.images.get(id);
  }

  /**
   * 読み込み済み画像要素を取得
   */
  getImageElement(id: string): HTMLImageElement | undefined {
    return this.loadedImages.get(id);
  }

  /**
   * 読み込み済み画像のリストを取得
   */
  getImageList(): ImageResource[] {
    return Array.from(this.images.values());
  }

  /**
   * 画像が読み込み済みかチェック
   */
  isImageLoaded(id: string): boolean {
    return this.loadedImages.has(id);
  }
}
