/**
 * CLI用画像ローダー
 * Node.js環境でJimpを使用して画像を読み込み、HTMLImageElementに相当するデータを生成
 */

const Jimp = require('jimp');
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI環境での画像データ
 */
export interface CliImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA形式のピクセルデータ
}

/**
 * CLI用画像ローダークラス
 */
export class CliImageLoader {
  
  /**
   * 画像ファイルを読み込んでCliImageDataを生成
   */
  async loadImage(imagePath: string): Promise<CliImageData | null> {
    try {
      console.log(`画像読み込み中: ${imagePath}`);
      
      // ファイルの存在確認
      if (!fs.existsSync(imagePath)) {
        console.error(`画像ファイルが見つかりません: ${imagePath}`);
        return null;
      }

      // Jimpで画像を読み込み
      const image = await Jimp.Jimp.read(imagePath);
      
      // RGBA形式のピクセルデータを取得
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      const data = new Uint8ClampedArray(width * height * 4);
      
      // ピクセルデータをRGBA形式で抽出
      let dataIndex = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const color = image.getPixelColor(x, y);
          
          // Jimpのカラー値をRGBA成分に分解
          const r = (color >>> 24) & 0xFF;
          const g = (color >>> 16) & 0xFF;
          const b = (color >>> 8) & 0xFF;
          const a = color & 0xFF;
          
          data[dataIndex++] = r;
          data[dataIndex++] = g;
          data[dataIndex++] = b;
          data[dataIndex++] = a;
        }
      }
      
      console.log(`画像読み込み完了: ${width}x${height} - ${imagePath}`);
      
      return {
        width,
        height,
        data
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`画像読み込みエラー: ${errorMessage} - ${imagePath}`);
      return null;
    }
  }

  /**
   * 画像ファイルパスを解決
   * プロジェクトファイルからの相対パスまたは絶対パスに対応
   */
  resolveImagePath(projectFilePath: string, imageFilename: string): string {
    const projectDir = path.dirname(projectFilePath);
    
    // 絶対パスの場合はそのまま使用
    if (path.isAbsolute(imageFilename)) {
      return imageFilename;
    }
    
    // 相対パスの場合はプロジェクトディレクトリからの相対パスとして解決
    return path.resolve(projectDir, imageFilename);
  }

  /**
   * 画像ディレクトリを検索して画像ファイルを見つける
   */
  findImageFile(projectFilePath: string, imageFilename: string): string | null {
    const projectDir = path.dirname(projectFilePath);
    
    // 候補パスのリスト
    const candidates = [
      // プロジェクトディレクトリ直下
      path.resolve(projectDir, imageFilename),
      // imagesディレクトリ内
      path.resolve(projectDir, 'images', imageFilename),
      // imageディレクトリ内  
      path.resolve(projectDir, 'image', imageFilename),
      // assetsディレクトリ内
      path.resolve(projectDir, 'assets', imageFilename),
      // 拡張子なしの場合の推測
      path.resolve(projectDir, imageFilename + '.png'),
      path.resolve(projectDir, 'images', imageFilename + '.png'),
      path.resolve(projectDir, imageFilename + '.jpg'),
      path.resolve(projectDir, 'images', imageFilename + '.jpg'),
    ];

    // 存在するファイルを検索
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        console.log(`画像ファイル発見: ${candidate}`);
        return candidate;
      }
    }

    console.warn(`画像ファイルが見つかりません: ${imageFilename}`);
    console.warn(`検索パス:`);
    candidates.forEach(path => console.warn(`  - ${path}`));
    
    return null;
  }
}
