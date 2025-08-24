/**
 * セミグラフィック変換のユニットテスト
 */

import { SemiGraphicConverter } from './semi-graphic-converter';

describe('SemiGraphicConverter', () => {
  let converter: SemiGraphicConverter;

  beforeEach(() => {
    converter = new SemiGraphicConverter();
  });

  describe('ビットパターンテスト', () => {
    test('全て塗られているパターン（xx/xx/xx/xx）は$ffになる', () => {
      // 2x4ピクセルの全て塗られている画像データを作成
      const imageData = createImageData([
        [1, 1], // Row 0: xx
        [1, 1], // Row 1: xx
        [1, 1], // Row 2: xx
        [1, 1], // Row 3: xx
      ]);

      const mockImageElement = {
        getImageData: () => imageData
      };

      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.blocks[0][0].pattern).toBe(0xff);
    });

    test('下2行だけ塗られているパターン（00/00/xx/xx）は$ccになる', () => {
      const imageData = createImageData([
        [0, 0], // Row 0: 00
        [0, 0], // Row 1: 00
        [1, 1], // Row 2: xx
        [1, 1], // Row 3: xx
      ]);

      const mockImageElement = {
        getImageData: () => imageData
      };

      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      // 下2行: 左列bit2,3 + 右列bit6,7 = 0x0c + 0xc0 = 0xcc
      expect(result.blocks[0][0].pattern).toBe(0xcc);
    });

    test('上2行だけ塗られているパターン（xx/xx/00/00）', () => {
      const imageData = createImageData([
        [1, 1], // Row 0: xx
        [1, 1], // Row 1: xx
        [0, 0], // Row 2: 00
        [0, 0], // Row 3: 00
      ]);

      const mockImageElement = {
        getImageData: () => imageData
      };

      const result = converter.convertImageToSemiGraphic(mockImageElement);
      const pattern = result.blocks[0][0].pattern;
      
      // 上2行のパターンを確認
      // 左列bit0,1 + 右列bit4,5 = 0x03 + 0x30 = 0x33
      expect(pattern).toBe(0x33);
    });

    test('左列だけ塗られているパターン（x0/x0/x0/x0）', () => {
      const imageData = createImageData([
        [1, 0], // Row 0: x0
        [1, 0], // Row 1: x0
        [1, 0], // Row 2: x0
        [1, 0], // Row 3: x0
      ]);

      const mockImageElement = {
        getImageData: () => imageData
      };

      const result = converter.convertImageToSemiGraphic(mockImageElement);
      const pattern = result.blocks[0][0].pattern;
      
      // 左列のパターンを確認
      // 左列bit3,2,1,0 = 0x0f
      expect(pattern).toBe(0x0f);
    });

    test('右列だけ塗られているパターン（0x/0x/0x/0x）', () => {
      const imageData = createImageData([
        [0, 1], // Row 0: 0x
        [0, 1], // Row 1: 0x
        [0, 1], // Row 2: 0x
        [0, 1], // Row 3: 0x
      ]);

      const mockImageElement = {
        getImageData: () => imageData
      };

      const result = converter.convertImageToSemiGraphic(mockImageElement);
      const pattern = result.blocks[0][0].pattern;
      
      // 右列のパターンを確認
      // 右列bit7,6,5,4 = 0xf0
      expect(pattern).toBe(0xf0);
    });

    test('ビット配置の詳細確認', () => {
      const testCases = [
        { dy: 0, dx: 0, expectedBit: 0 }, // 左列上から1番目 -> bit0
        { dy: 0, dx: 1, expectedBit: 4 }, // 右列上から1番目 -> bit4
        { dy: 1, dx: 0, expectedBit: 1 }, // 左列上から2番目 -> bit1
        { dy: 1, dx: 1, expectedBit: 5 }, // 右列上から2番目 -> bit5
        { dy: 2, dx: 0, expectedBit: 2 }, // 左列上から3番目 -> bit2
        { dy: 2, dx: 1, expectedBit: 6 }, // 右列上から3番目 -> bit6
        { dy: 3, dx: 0, expectedBit: 3 }, // 左列上から4番目 -> bit3
        { dy: 3, dx: 1, expectedBit: 7 }, // 右列上から4番目 -> bit7
      ];

      testCases.forEach(testCase => {
        const calculatedBit = testCase.dx === 0 ? testCase.dy : (4 + testCase.dy);
        
        expect(calculatedBit).toBe(testCase.expectedBit);
      });
    });

    test('個別ピクセルのビット確認', () => {
      // 各ピクセル位置を個別にテスト
      const testPositions = [
        { row: 0, col: 0, expectedPattern: 0x01 }, // bit0
        { row: 0, col: 1, expectedPattern: 0x10 }, // bit4
        { row: 1, col: 0, expectedPattern: 0x02 }, // bit1
        { row: 1, col: 1, expectedPattern: 0x20 }, // bit5
        { row: 2, col: 0, expectedPattern: 0x04 }, // bit2
        { row: 2, col: 1, expectedPattern: 0x40 }, // bit6
        { row: 3, col: 0, expectedPattern: 0x08 }, // bit3
        { row: 3, col: 1, expectedPattern: 0x80 }, // bit7
      ];

      testPositions.forEach(pos => {
        const pattern = Array(4).fill(null).map(() => [0, 0]);
        pattern[pos.row][pos.col] = 1;
        
        const imageData = createImageData(pattern as number[][]);
        const mockImageElement = { getImageData: () => imageData };
        const result = converter.convertImageToSemiGraphic(mockImageElement);
        
        expect(result.blocks[0][0].pattern).toBe(pos.expectedPattern);
      });
    });
  });

  describe('色変換テスト', () => {
    test('白色が正しく認識される', () => {
      const imageData = createImageData([[1, 1], [1, 1], [1, 1], [1, 1]]);
      const mockImageElement = { getImageData: () => imageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      // 白色は colorCode 7
      expect(result.blocks[0][0].colorCode).toBe(7);
    });

    test('透明ピクセルは無視される', () => {
      const imageData = createImageData([[0, 0], [0, 0], [0, 0], [0, 0]]);
      const mockImageElement = { getImageData: () => imageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      expect(result.blocks[0][0].pattern).toBe(0x00);
      expect(result.blocks[0][0].colorCode).toBe(0); // デフォルトは黒
    });

    test('デジタル8色の基本色が正しく認識される', () => {
      const digitalColors = [
        { r: 0, g: 0, b: 0, expected: 0 },     // 黒
        { r: 0, g: 0, b: 255, expected: 1 },   // 青
        { r: 255, g: 0, b: 0, expected: 2 },   // 赤
        { r: 255, g: 0, b: 255, expected: 3 }, // 紫
        { r: 0, g: 255, b: 0, expected: 4 },   // 緑
        { r: 0, g: 255, b: 255, expected: 5 }, // 水色
        { r: 255, g: 255, b: 0, expected: 6 }, // 黄色
        { r: 255, g: 255, b: 255, expected: 7 }// 白
      ];

      digitalColors.forEach(color => {
        const imageData = createColorImageData(color.r, color.g, color.b);
        const mockImageElement = { getImageData: () => imageData };
        const result = converter.convertImageToSemiGraphic(mockImageElement);
        
        expect(result.blocks[0][0].colorCode).toBe(color.expected);
      });
    });

    test('近似色の選択が正しく動作する', () => {
      const testCases = [
        { r: 50, g: 50, b: 50, expected: 0 },     // 暗いグレー → 黒
        { r: 200, g: 200, b: 200, expected: 7 },  // 明るいグレー → 白
        { r: 100, g: 0, b: 0, expected: 0 },      // 暗い赤 → 黒（黒の方が近い）
        { r: 0, g: 100, b: 0, expected: 0 },      // 暗い緑 → 黒（黒の方が近い）
        { r: 0, g: 0, b: 100, expected: 0 },      // 暗い青 → 黒（黒の方が近い）
        { r: 200, g: 100, b: 0, expected: 2 },    // オレンジ → 赤
        { r: 100, g: 200, b: 100, expected: 4 },  // 薄緑 → 緑
        { r: 150, g: 0, b: 150, expected: 3 },    // 紫系 → 紫
      ];

      testCases.forEach(testCase => {
        const imageData = createColorImageData(testCase.r, testCase.g, testCase.b);
        const mockImageElement = { getImageData: () => imageData };
        const result = converter.convertImageToSemiGraphic(mockImageElement);
        
        expect(result.blocks[0][0].colorCode).toBe(testCase.expected);
      });
    });

    test('混合色の中で最頻色が選択される', () => {
      // 2x4ピクセルで異なる色が混在する場合のテスト
      const mixedImageData = createMixedColorImageData([
        [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }],   // 赤、緑
        [{ r: 255, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }],   // 赤、赤
        [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }],   // 赤、緑
        [{ r: 255, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }],   // 赤、赤
      ]);

      const mockImageElement = { getImageData: () => mixedImageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      // 赤が4個、緑が2個なので赤（colorCode: 2）が選択される
      expect(result.blocks[0][0].colorCode).toBe(2);
    });

    test('一行分の画像データの色取得テスト', () => {
      // 4x4ピクセル（2x1セミグラフィックブロック）の一行画像を作成
      const lineImageData = createLineImageData([
        { r: 255, g: 0, b: 0 },     // ブロック1: 赤
        { r: 0, g: 255, b: 0 },     // ブロック2: 緑
      ]);

      const mockImageElement = { getImageData: () => lineImageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      // 1行2ブロックの結果を確認
      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
      expect(result.blocks[0][0].colorCode).toBe(2); // 赤
      expect(result.blocks[0][1].colorCode).toBe(4); // 緑
      expect(result.blocks[0][0].pattern).toBe(0xff); // 全て塗られている
      expect(result.blocks[0][1].pattern).toBe(0xff); // 全て塗られている
    });

    test('一行分の部分的パターンの色取得テスト', () => {
      // より単純なテストケース：赤と緑の単色ブロック
      const simpleLineImageData = createLineImageData([
        { r: 255, g: 0, b: 0 },     // ブロック1: 赤
        { r: 0, g: 255, b: 0 },     // ブロック2: 緑
      ]);

      const mockImageElement = { getImageData: () => simpleLineImageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      // 1行2ブロックの結果を確認
      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
      
      // 各ブロックは単色で全て塗られている
      expect(result.blocks[0][0].pattern).toBe(0xff); // 全て塗られている
      expect(result.blocks[0][0].colorCode).toBe(2);  // 赤
      
      expect(result.blocks[0][1].pattern).toBe(0xff); // 全て塗られている
      expect(result.blocks[0][1].colorCode).toBe(4);  // 緑
    });

    test('一行分の長い画像データテスト', () => {
      // 12x4ピクセル（6x1セミグラフィックブロック）の長い一行画像
      const longLineColors = [
        { r: 255, g: 0, b: 0 },     // ブロック1: 赤
        { r: 0, g: 255, b: 0 },     // ブロック2: 緑
        { r: 0, g: 0, b: 255 },     // ブロック3: 青
        { r: 255, g: 255, b: 0 },   // ブロック4: 黄
        { r: 255, g: 0, b: 255 },   // ブロック5: 紫
        { r: 0, g: 255, b: 255 },   // ブロック6: 水色
      ];

      const longLineImageData = createLineImageData(longLineColors);
      const mockImageElement = { getImageData: () => longLineImageData };
      const result = converter.convertImageToSemiGraphic(mockImageElement);
      
      // 1行6ブロックの結果を確認
      expect(result.width).toBe(6);
      expect(result.height).toBe(1);
      
      // 各ブロックの色が正しく認識されることを確認
      expect(result.blocks[0][0].colorCode).toBe(2); // 赤
      expect(result.blocks[0][1].colorCode).toBe(4); // 緑
      expect(result.blocks[0][2].colorCode).toBe(1); // 青
      expect(result.blocks[0][3].colorCode).toBe(6); // 黄
      expect(result.blocks[0][4].colorCode).toBe(3); // 紫
      expect(result.blocks[0][5].colorCode).toBe(5); // 水色
      
      // 全ブロックが全て塗られているパターン
      for (let x = 0; x < 6; x++) {
        expect(result.blocks[0][x].pattern).toBe(0xff);
      }
    });

  });

  describe('色名取得テスト', () => {
    test('色コードから正しい色名が取得される', () => {
      expect(converter.getColorName(0)).toBe('黒');
      expect(converter.getColorName(1)).toBe('青');
      expect(converter.getColorName(2)).toBe('赤');
      expect(converter.getColorName(3)).toBe('紫');
      expect(converter.getColorName(4)).toBe('緑');
      expect(converter.getColorName(5)).toBe('水色');
      expect(converter.getColorName(6)).toBe('黄');
      expect(converter.getColorName(7)).toBe('白');
    });

    test('不正な色コードは不明と表示される', () => {
      expect(converter.getColorName(8)).toBe('不明');
      expect(converter.getColorName(-1)).toBe('不明');
      expect(converter.getColorName(255)).toBe('不明');
    });
  });
});

/**
 * テスト用の画像データを作成するヘルパー関数
 * @param pattern 4x2の配列。1=白ピクセル、0=透明ピクセル
 */
function createImageData(pattern: number[][]): any {
  const width = 2;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const pixelValue = pattern[y][x];
      
      if (pixelValue === 1) {
        // 白ピクセル
        data[index] = 255;     // R
        data[index + 1] = 255; // G
        data[index + 2] = 255; // B
        data[index + 3] = 255; // A
      } else {
        // 透明ピクセル
        data[index] = 0;       // R
        data[index + 1] = 0;   // G
        data[index + 2] = 0;   // B
        data[index + 3] = 0;   // A (透明)
      }
    }
  }

  return { width, height, data };
}

/**
 * 指定したRGB色の2x4画像データを作成するヘルパー関数
 */
function createColorImageData(r: number, g: number, b: number): any {
  const width = 2;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      
      data[index] = r;       // R
      data[index + 1] = g;   // G
      data[index + 2] = b;   // B
      data[index + 3] = 255; // A (不透明)
    }
  }

  return { width, height, data };
}

/**
 * 混合色の2x4画像データを作成するヘルパー関数
 */
function createMixedColorImageData(colors: { r: number, g: number, b: number }[][]): any {
  const width = 2;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const color = colors[y][x];
      
      data[index] = color.r;     // R
      data[index + 1] = color.g; // G
      data[index + 2] = color.b; // B
      data[index + 3] = 255;     // A (不透明)
    }
  }

  return { width, height, data };
}

/**
 * 一行分の画像データを作成するヘルパー関数
 * @param colors 各ブロックの色配列
 */
function createLineImageData(colors: { r: number, g: number, b: number }[]): any {
  const blockCount = colors.length;
  const width = blockCount * 2; // 各ブロックは幅2ピクセル
  const height = 4; // セミグラフィックブロックの高さ
  const data = new Uint8ClampedArray(width * height * 4);

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const color = colors[blockIndex];
    
    // 各ブロックの2x4ピクセルを塗りつぶし
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < 2; x++) {
        const pixelX = blockIndex * 2 + x;
        const index = (y * width + pixelX) * 4;
        
        data[index] = color.r;     // R
        data[index + 1] = color.g; // G
        data[index + 2] = color.b; // B
        data[index + 3] = 255;     // A (不透明)
      }
    }
  }

  return { width, height, data };
}
