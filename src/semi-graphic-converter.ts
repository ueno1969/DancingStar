/**
 * セミグラフィック変換機能（mainプロセス用）
 * 
 * PC-8801のセミグラフィック仕様:
 * - 2x4ドット単位のセミグラフィックデータに変換
 * - ビットパターン（8ビット）とカラーコード（3ビット）で構成
 * - デジタル8色対応
 * 
 * 詳細仕様: https://pc8801.web.fc2.com/semi-graphic.html
 */

const Jimp = require('jimp');
import { ProjectData } from './types/project';

/**
 * RGB色情報
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * セミグラフィック画素データ（2x4ドット）
 */
export interface SemiGraphicBlock {
  pattern: number; // 8ビットパターン（PC-8801: 左列bit0-3(上→下), 右列bit4-7(上→下)）
  colorCode: number; // カラーコード（0-7）
}

/**
 * セミグラフィック画像データ
 */
export interface SemiGraphicData {
  width: number; // セミグラ単位での幅（実ドット数/2）
  height: number; // セミグラ単位での高さ（実ドット数/4）
  blocks: SemiGraphicBlock[][]; // [y][x]の2次元配列
}

/**
 * セミグラフィック変換クラス
 */
export class SemiGraphicConverter {
  /**
   * デジタル8色のRGB値定義
   */
  private static readonly DIGITAL_COLORS: RGBColor[] = [
    { r: 0, g: 0, b: 0 },     // 0: 黒
    { r: 0, g: 0, b: 255 },   // 1: 青
    { r: 255, g: 0, b: 0 },   // 2: 赤
    { r: 255, g: 0, b: 255 }, // 3: 紫
    { r: 0, g: 255, b: 0 },   // 4: 緑
    { r: 0, g: 255, b: 255 }, // 5: 水色
    { r: 255, g: 255, b: 0 }, // 6: 黄色
    { r: 255, g: 255, b: 255 }// 7: 白
  ];

  /**
   * プロジェクトデータから指定された画像IDのセミグラフィックデータを生成
   */
  async convertImageFromProject(projectData: ProjectData, imageId: string): Promise<SemiGraphicData | null> {
    const imageResource = projectData.images.find(img => img.id === imageId);
    if (!imageResource) {
      console.error(`画像ID ${imageId} が見つかりません`);
      return null;
    }

    try {
      // ファイルパスから画像を読み込み
      const image = await Jimp.Jimp.read(imageResource.filename);
      return await this.convertJimpToSemiGraphic(image);
    } catch (error) {
      console.error('画像変換エラー:', error);
      return null;
    }
  }

  /**
   * 画像ファイルパスからセミグラフィックデータを生成
   */
  async convertImageFile(imagePath: string): Promise<SemiGraphicData | null> {
    try {
      const image = await Jimp.Jimp.read(imagePath);
      return await this.convertJimpToSemiGraphic(image);
    } catch (error) {
      console.error('画像読み込みエラー:', error);
      return null;
    }
  }

  /**
   * Jimp画像オブジェクトをセミグラフィックデータに変換
   */
  private async convertJimpToSemiGraphic(image: any): Promise<SemiGraphicData> {
    // 元画像のサイズを取得
    const originalWidth = image.bitmap.width;
    const originalHeight = image.bitmap.height;
    
    // 2x4ドットで割り切れるように調整したサイズを計算
    const adjustedWidth = Math.ceil(originalWidth / 2) * 2;
    const adjustedHeight = Math.ceil(originalHeight / 4) * 4;
    
    // セミグラフィック単位でのサイズ（2x4ドット単位）
    const semiWidth = adjustedWidth / 2;
    const semiHeight = adjustedHeight / 4;
    
    const blocks: SemiGraphicBlock[][] = [];
    
    // 各セミグラフィック単位を処理
    for (let y = 0; y < semiHeight; y++) {
      const row: SemiGraphicBlock[] = [];
      
      for (let x = 0; x < semiWidth; x++) {
        // 2x4ドットのパターンを生成
        const block = this.generateSemiGraphicBlockFromJimp(x, y, image, originalWidth, originalHeight);
        row.push(block);
      }
      
      blocks.push(row);
    }
    
    return {
      width: semiWidth,
      height: semiHeight,
      blocks
    };
  }

  /**
   * 指定位置の2x4ドットパターンからセミグラフィックブロックを生成（Jimp版）
   */
  private generateSemiGraphicBlockFromJimp(
    blockX: number, 
    blockY: number, 
    image: any,
    originalWidth: number,
    originalHeight: number
  ): SemiGraphicBlock {
    let pattern = 0;
    const colors: number[] = [];
    
    // 2x4のドットパターンを生成
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const pixelX = blockX * 2 + dx;
        const pixelY = blockY * 4 + dy;
        
        // 画像境界のチェック
        if (pixelX >= originalWidth || pixelY >= originalHeight) {
          // 境界外は透明として扱う（ビットはセットしない）
          continue;
        }
        
        // Jimpからピクセル色を取得
        const color = image.getPixelColor(pixelX, pixelY);
        const r = (color >> 24) & 0xFF;
        const g = (color >> 16) & 0xFF;
        const b = (color >> 8) & 0xFF;
        const alpha = color & 0xFF;
        
        // 透明度が50%以上の場合はドットとして扱う
        if (alpha > 127) {
          // PC-8801セミグラフィックビット配置: 左列bit0-3, 右列bit4-7 (上から下)
          // 詳細: https://pc8801.web.fc2.com/semi-graphic.html
          const bitIndex = dx === 0 ? dy : (4 + dy);
          
          pattern |= (1 << bitIndex);
          
          // 最も近いデジタル8色を取得
          const colorCode = this.findNearestColor({ r, g, b });
          colors.push(colorCode);
        }
      }
    }
    
    // 最も頻繁に使用される色を選択
    const colorCode = this.getMostFrequentColor(colors);
    
    return {
      pattern,
      colorCode
    };
  }

  /**
   * HTMLImageElementまたはCLI環境のmockImageElementからセミグラフィックデータに変換
   */
  convertImageToSemiGraphic(imageElement: HTMLImageElement | any): SemiGraphicData {
    // CLI環境のmockImageElementの場合
    if (imageElement && typeof imageElement.getImageData === 'function') {
      const imageData = imageElement.getImageData();
      return this.convertImageDataToSemiGraphic(imageData);
    }
    
    // 従来のHTMLImageElementの場合（ブラウザ環境）
    throw new Error('ブラウザ環境での変換は現在サポートされていません。mainプロセスのconvertImageFromProject()またはconvertImageFile()を使用してください。');
  }

  /**
   * ImageDataオブジェクトからセミグラフィックデータに変換
   */
  private convertImageDataToSemiGraphic(imageData: { width: number, height: number, data: Uint8ClampedArray }): SemiGraphicData {
    const originalWidth = imageData.width;
    const originalHeight = imageData.height;
    
    // 2x4ドットで割り切れるように調整したサイズを計算
    const adjustedWidth = Math.ceil(originalWidth / 2) * 2;
    const adjustedHeight = Math.ceil(originalHeight / 4) * 4;
    
    // セミグラフィック単位でのサイズ（2x4ドット単位）
    const semiWidth = adjustedWidth / 2;
    const semiHeight = adjustedHeight / 4;
    
    const blocks: SemiGraphicBlock[][] = [];
    
    // 各セミグラフィック単位を処理
    for (let y = 0; y < semiHeight; y++) {
      const row: SemiGraphicBlock[] = [];
      
      for (let x = 0; x < semiWidth; x++) {
        // 2x4ドットのブロック内の各ピクセルを読み取り
        const blockColors: number[] = [];
        let pattern = 0;
        
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const pixelX = x * 2 + dx;
            const pixelY = y * 4 + dy;
            
            // 元画像の範囲内かチェック
            if (pixelX < originalWidth && pixelY < originalHeight) {
              // RGBA値を取得
              const index = (pixelY * originalWidth + pixelX) * 4;
              const r = imageData.data[index];
              const g = imageData.data[index + 1];
              const b = imageData.data[index + 2];
              const a = imageData.data[index + 3];
              
              // 透明ピクセルは黒として扱う
              if (a < 128) {
                blockColors.push(0); // 黒
              } else {
                const colorIndex = this.findNearestColor({ r, g, b });
                blockColors.push(colorIndex);
                
                // セミグラフィックパターンのビットを設定
                // PC-8801セミグラフィックビット配置: 左列bit0-3, 右列bit4-7 (上から下)
                const bitIndex = dx === 0 ? dy : (4 + dy);
                
                if (colorIndex !== 0) { // 黒以外の場合
                  pattern |= (1 << bitIndex);
                }
              }
            } else {
              // 範囲外は黒として扱う
              blockColors.push(0);
            }
          }
        }
        
        // このブロックの代表色を決定（最も多く使われている色）
        const representativeColor = this.getMostFrequentColor(blockColors);
        
        row.push({
          pattern,
          colorCode: representativeColor
        });
      }
      
      blocks.push(row);
    }
    
    return {
      width: semiWidth,
      height: semiHeight,
      blocks
    };
  }

  /**
   * RGB値から最も近いデジタル8色のインデックスを取得
   */
  private findNearestColor(rgb: RGBColor): number {
    let minDistance = Infinity;
    let nearestIndex = 0;
    
    for (let i = 0; i < SemiGraphicConverter.DIGITAL_COLORS.length; i++) {
      const color = SemiGraphicConverter.DIGITAL_COLORS[i];
      const distance = Math.sqrt(
        Math.pow(rgb.r - color.r, 2) +
        Math.pow(rgb.g - color.g, 2) +
        Math.pow(rgb.b - color.b, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
    
    return nearestIndex;
  }

  /**
   * 配列から最も頻繁に使用される色を取得
   * 黒（カラーコード0）は考慮しない
   */
  private getMostFrequentColor(colors: number[]): number {
    if (colors.length === 0) {
      return 0; // デフォルトは黒
    }
    
    const frequency: { [key: number]: number } = {};
    
    for (const color of colors) {
      // 黒（カラーコード0）は除外
      if (color !== 0) {
        frequency[color] = (frequency[color] || 0) + 1;
      }
    }
    
    let maxCount = 0;
    let mostFrequent = 0;
    
    for (const [colorStr, count] of Object.entries(frequency)) {
      const color = parseInt(colorStr);
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = color;
      }
    }
    
    return mostFrequent;
  }

  /**
   * セミグラフィックデータをコンソールに出力するデバッグ用メソッド
   */
  debugPrintSemiGraphic(semiData: SemiGraphicData): void {
    const originalSize = this.calculateImageSize(semiData.width, semiData.height);
    console.log(`セミグラフィックデータ: ${semiData.width}x${semiData.height} ブロック`);
    console.log(`元画像サイズ: ${originalSize.width}x${originalSize.height} ピクセル`);
    
    for (let y = 0; y < Math.min(semiData.height, 10); y++) { // 最初の10行まで表示
      let line = '';
      for (let x = 0; x < Math.min(semiData.width, 20); x++) { // 最初の20列まで表示
        const block = semiData.blocks[y][x];
        line += `[${block.pattern.toString(16).padStart(2, '0')}:${block.colorCode}] `;
      }
      console.log(`行${y}: ${line}`);
    }
    
    if (semiData.height > 10) {
      console.log(`... (${semiData.height - 10} 行省略)`);
    }
  }

  /**
   * デジタル8色の名前を取得
   */
  getColorName(colorCode: number): string {
    const colorNames = ['黒', '青', '赤', '紫', '緑', '水色', '黄', '白'];
    return colorNames[colorCode] || '不明';
  }

  /**
   * 画像サイズからセミグラフィックブロック数を計算
   */
  calculateSemiGraphicSize(imageWidth: number, imageHeight: number): { width: number; height: number } {
    return {
      width: Math.floor(imageWidth / 2),
      height: Math.floor(imageHeight / 4)
    };
  }

  /**
   * セミグラフィックブロック数から元画像サイズを計算
   */
  calculateImageSize(semiWidth: number, semiHeight: number): { width: number; height: number } {
    return {
      width: semiWidth * 2,
      height: semiHeight * 4
    };
  }

  /**
   * セミグラフィックデータの統計情報を取得
   */
  getStatistics(semiData: SemiGraphicData): {
    totalBlocks: number;
    usedColors: number[];
    colorFrequency: { [key: number]: number };
    nonEmptyBlocks: number;
  } {
    const totalBlocks = semiData.width * semiData.height;
    const colorFrequency: { [key: number]: number } = {};
    let nonEmptyBlocks = 0;

    for (let y = 0; y < semiData.height; y++) {
      for (let x = 0; x < semiData.width; x++) {
        const block = semiData.blocks[y][x];
        
        if (block.pattern > 0) {
          nonEmptyBlocks++;
        }
        
        colorFrequency[block.colorCode] = (colorFrequency[block.colorCode] || 0) + 1;
      }
    }

    const usedColors = Object.keys(colorFrequency).map(Number).sort();

    return {
      totalBlocks,
      usedColors,
      colorFrequency,
      nonEmptyBlocks
    };
  }
}
