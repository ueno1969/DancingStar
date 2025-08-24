/**
 * Z80アセンブリコードエクスポート機能
 */
import { ProjectData } from './types/project';
import { SemiGraphicConverter, SemiGraphicData } from './semi-graphic-converter';
import * as fs from 'fs';

export interface Z80ExportOptions {
  outputPath: string;
}

export interface Z80ExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  linesGenerated?: number;
  sizeBytes?: number;
}

/**
 * Z80アセンブリコードエクスポートクラス
 */
export class Z80Exporter {
  private semiGraphicConverter: SemiGraphicConverter;

  constructor() {
    this.semiGraphicConverter = new SemiGraphicConverter();
  }

  /**
   * プロジェクトをZ80アセンブリコードにエクスポート
   */
  async exportProject(projectData: ProjectData, options: Z80ExportOptions): Promise<Z80ExportResult> {
    try {
      console.log('Z80エクスポート開始:', options.outputPath);
      
      // Z80アセンブリコードを生成
      const asmCode = this.generateZ80Code(projectData);
      
      // ファイルに書き込み
      fs.writeFileSync(options.outputPath, asmCode, 'utf8');
      
      // 結果を返す
      const stats = fs.statSync(options.outputPath);
      const lines = asmCode.split('\n').length;
      
      console.log(`Z80エクスポート完了: ${lines}行, ${stats.size}バイト`);
      
      return {
        success: true,
        outputPath: options.outputPath,
        linesGenerated: lines,
        sizeBytes: stats.size
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Z80エクスポートエラー:', errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * セミグラフィックデータをZ80アセンブリの DB文に変換
   */
  private generateSemiGraphicDB(semiData: SemiGraphicData, labelPrefix: string = 'SEMI_DATA'): string[] {
    const lines: string[] = [];
    
    lines.push(`; セミグラフィックデータ (${semiData.width}x${semiData.height})`);
    lines.push(`${labelPrefix}:`);
    
    for (let y = 0; y < semiData.height; y++) {
      const dataBytes: string[] = [];
      
      for (let x = 0; x < semiData.width; x++) {
        const block = semiData.blocks[y][x];
        dataBytes.push(`$${block.pattern.toString(16).padStart(2, '0').toUpperCase()}`);
      }
      
      // 1行あたり16バイトで区切る
      for (let i = 0; i < dataBytes.length; i += 16) {
        const chunk = dataBytes.slice(i, i + 16);
        lines.push(`\tDB\t${chunk.join(', ')}`);
      }
    }
    
    return lines;
  }

  /**
   * カラーアトリビュートデータをZ80アセンブリの DB文に変換
   * 1バイト目に変更回数、その後にX座標、色の組み合わせ
   * 先頭の白色は省略するが、末尾の白色は省略しない
   */
  private generateColorAttributeDB(semiData: SemiGraphicData, labelPrefix: string = 'COLOR_ATTR'): string[] {
    const lines: string[] = [];
    
    lines.push(`; カラーアトリビュートデータ (${semiData.width}x${semiData.height})`);
    lines.push(`${labelPrefix}:`);
    
    for (let y = 0; y < semiData.height; y++) {
      const attributePairs: string[] = [];
      
      // 横一行の色データを取得
      const rowColors: number[] = [];
      for (let x = 0; x < semiData.width; x++) {
        rowColors.push(semiData.blocks[y][x].colorCode);
      }
      
      // 先頭の白色を除去
      let startIndex = 0;
      while (startIndex < rowColors.length && rowColors[startIndex] === 7) {
        startIndex++;
      }
      
      // 末尾の白色は除去しない（新仕様）
      let endIndex = rowColors.length - 1;
      
      // 有効な範囲がない場合（全て白色）
      if (startIndex > endIndex) {
        // 最低でも1個白で出力
        lines.push(`\tDB\t1, 0, $F8`); // 変更回数1、X座標0、白色
        continue;
      }
      
      // 色の変更を検出してX座標と色のペアを作成
      let currentColor = -1;
      let changeCount = 0;
      
      for (let x = startIndex; x <= endIndex; x++) {
        const colorCode = rowColors[x];
        
        // 黒色（色コード0）は前の色が続くものとして扱い、スキップ
        if (colorCode === 0) {
          continue;
        }
        
        if (colorCode !== currentColor) {
          // 色が変わった場合、新しいX座標と色を記録
          const attrColorCode = this.getAttributeColorCode(colorCode);
          attributePairs.push(`${x}`);
          attributePairs.push(`$${attrColorCode.toString(16).padStart(2, '0').toUpperCase()}`);
          currentColor = colorCode;
          changeCount++;
        }
      }
      
      // 1行ずつ出力（1バイト目に変更回数）
      if (changeCount === 0) {
        // 変更がない場合（黒色のみ等）も最低でも1個白で出力
        lines.push(`\tDB\t1, 0, $F8`); // 変更回数1、X座標0、白色
      } else {
        const pairStrings: string[] = [];
        for (let i = 0; i < attributePairs.length; i += 2) {
          pairStrings.push(`${attributePairs[i]}, ${attributePairs[i + 1]}`);
        }
        lines.push(`\tDB\t${changeCount}, ${pairStrings.join(', ')}`);
      }
    }
    
    return lines;
  }

  /**
   * 色コードをアトリビュート値に変換
   */
  private getAttributeColorCode(colorCode: number): number {
    const colorMap = [
      0x18, // 0: 黒
      0x38, // 1: 青  
      0x58, // 2: 赤
      0x78, // 3: 紫
      0x98, // 4: 緑
      0xB8, // 5: 水色
      0xD8, // 6: 黄色
      0xF8  // 7: 白
    ];
    
    return colorMap[colorCode] || 0xF8; // デフォルトは白
  }

  /**
   * Z80アセンブリコードを生成（セミグラフィックデータを含む）
   */
  private generateZ80Code(projectData: ProjectData): string {
    const lines: string[] = [];
    
    // ヘッダーコメント
    lines.push(';');
    lines.push(`; Z80 Dancing Editor Generated Assembly Code`);
    lines.push(`; Project: ${projectData.name}`);
    lines.push(`; Generated: ${new Date().toISOString()}`);
    lines.push(`; Canvas Size: ${projectData.settings.canvasWidth}x${projectData.settings.canvasHeight}`);
    lines.push(`; Images: ${projectData.images?.length || 0}`);
    lines.push(`; Sequences: ${projectData.sequences?.length || 0}`);
    lines.push(';');
    lines.push('');
    
    // 画像データ部分（セミグラフィック変換）
    lines.push('; === Image Data Section ===');
    lines.push('');
    
    // キャラクタ定義（共通値、ファイル全体で1箇所のみ）
    lines.push(`Character:`);
    lines.push(`.wByte       equ 32 / 2             ; 1キャラクタの幅`);
    lines.push(`.hByte       equ 68 / 4             ; 1キャラクタの高さ`);
    lines.push(`.attrCount   equ 10                 ; アトリビュートの色変更数`);
    lines.push('');
    
    if (projectData.images && projectData.images.length > 0) {
      for (let i = 0; i < projectData.images.length; i++) {
        const image = projectData.images[i];
        lines.push('');
        lines.push(`; Image: ${image.filename} (${image.width}x${image.height})`);
        
        // 画像要素が存在する場合のみセミグラフィック変換
        if (image.imageElement) {
          try {
            const semiData = this.semiGraphicConverter.convertImageToSemiGraphic(image.imageElement);
            
            // セミグラフィックデータの出力
            const imageNumber = String(parseInt(image.id)).padStart(3, '0');
            const semiLines = this.generateSemiGraphicDB(semiData, `Image_${imageNumber}`);
            lines.push(...semiLines);
            lines.push('');
            
            // カラーアトリビュートデータの出力
            const colorLines = this.generateColorAttributeDB(semiData, `Attr_${imageNumber}`);
            lines.push(...colorLines);
            lines.push('');
            
            // データサイズ情報をコメントで追加
            lines.push(`; Image ${imageNumber} Size: ${semiData.width}x${semiData.height} semi-graphic blocks`);
            lines.push(`; Data Size: ${semiData.width * semiData.height} bytes (semi) + ${semiData.width * semiData.height} bytes (color)`);
            
          } catch (error) {
            lines.push(`; Error converting image ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          lines.push(`; Image element not loaded for: ${image.filename}`);
        }
      }
    } else {
      lines.push('; No images in project');
    }
    
    lines.push('');
    
    // アニメーションシーケンス部分（フレームデータ）
    lines.push('; === Animation Sequences ===');
    
    if (projectData.sequences && projectData.sequences.length > 0) {
      for (let i = 0; i < projectData.sequences.length; i++) {
        const sequence = projectData.sequences[i];
        lines.push('');
        lines.push(`; Sequence: ${sequence.name}`);
        lines.push(`; Frames: ${sequence.frames.length}, Loop: ${sequence.loop}`);
        lines.push(`Sequence:`);
        
        // フレームデータ
        for (let j = 0; j < sequence.frames.length; j++) {
          const frame = sequence.frames[j];
          const imageNumber = String(parseInt(frame.imageId)).padStart(3, '0');
          lines.push(`\t; Frame ${j + 1}: Image ${frame.imageId}, Pos(${frame.x},${frame.y}), Wait: ${frame.waitTime}`);
          lines.push(`\tdw\tImage_${imageNumber}    ; キャラクタデータアドレス`);
          lines.push(`\tdb\t${frame.y}, ${frame.x}        ; Y, X`);
          lines.push(`\tdb\t${frame.waitTime}           ; ウェイトフレーム数`);
        }
        
        // シーケンス終了マーカー
        lines.push(`\tdw\t0            ; 終了`);
      }
    } else {
      lines.push('; No sequences in project');
    }
    
    lines.push('');
    
    // エンドマーカー
    lines.push('; === End of Generated Code ===');

    return lines.join('\n');
  }

  /**
   * セミグラフィックコンバーターへのアクセサ（テスト用）
   */
  getSemiGraphicConverter(): SemiGraphicConverter {
    return this.semiGraphicConverter;
  }

  /**
   * サポートされているエクスポート形式を取得
   */
  static getSupportedFormats(): string[] {
    return ['asm']; // アセンブリファイルのみ
  }

  /**
   * エクスポートファイルの拡張子を取得
   */
  static getFileExtension(_format?: string): string {
    return '.asm'; // 常に .asm
  }
}
