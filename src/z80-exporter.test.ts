/**
 * Z80エクスポーター のユニットテスト
 */

import { Z80Exporter, Z80ExportOptions } from './z80-exporter';
import { ProjectData } from './types/project';
import { SemiGraphicData, SemiGraphicBlock } from './semi-graphic-converter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// fsモジュールをモック化
jest.mock('fs');

// SemiGraphicConverterをモック化
jest.mock('./semi-graphic-converter', () => ({
  SemiGraphicConverter: jest.fn().mockImplementation(() => ({
    convertImageToSemiGraphic: jest.fn().mockReturnValue({
      width: 2,
      height: 1,
      blocks: [[
        { pattern: 0xFF, colorCode: 7 },
        { pattern: 0xCC, colorCode: 2 }
      ]]
    })
  }))
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Z80Exporter', () => {
  let exporter: Z80Exporter;
  let tempDir: string;
  let mockProjectData: ProjectData;

  beforeEach(() => {
    exporter = new Z80Exporter();
    tempDir = path.join(os.tmpdir(), 'z80-exporter-test');
    
    // モックプロジェクトデータを作成
    mockProjectData = createMockProjectData();
    
    // fsモックのリセットと初期設定
    mockedFs.writeFileSync.mockClear();
    mockedFs.statSync.mockClear();
    
    // writeFileSyncはデフォルトで正常動作させる
    mockedFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('exportProject', () => {
    test('正常なプロジェクトデータでエクスポートが成功する', async () => {
      const outputPath = path.join(tempDir, 'test-output.asm');
      const options: Z80ExportOptions = { outputPath };

      // statSyncのモック設定
      mockedFs.statSync.mockReturnValue({
        size: 1024
      } as fs.Stats);

      const result = await exporter.exportProject(mockProjectData, options);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.linesGenerated).toBeGreaterThan(0);
      expect(result.sizeBytes).toBe(1024);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('Z80 Dancing Editor Generated Assembly Code'),
        'utf8'
      );
    });

    test('書き込みエラーが発生した場合にエラー結果を返す', async () => {
      const outputPath = path.join(tempDir, 'test-output.asm');
      const options: Z80ExportOptions = { outputPath };
      const errorMessage = 'Permission denied';

      // writeFileSyncでエラーをスロー
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await exporter.exportProject(mockProjectData, options);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.outputPath).toBeUndefined();
    });

    test('空のプロジェクトでもエクスポートが成功する', async () => {
      const emptyProject: ProjectData = {
        name: 'Empty Project',
        version: '1.0.0',
        images: [],
        sequences: [],
        settings: {
          canvasWidth: 256,
          canvasHeight: 192,
          defaultFrameRate: 60,
          backgroundColor: '#000000'
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      const outputPath = path.join(tempDir, 'empty-output.asm');
      const options: Z80ExportOptions = { outputPath };

      // writeFileSyncモックを正常動作させる
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.statSync.mockReturnValue({
        size: 512
      } as fs.Stats);

      const result = await exporter.exportProject(emptyProject, options);

      expect(result.success).toBe(true);
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
      
      const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('No images in project');
      expect(writtenContent).toContain('No sequences in project');
    });
  });

  describe('generateSemiGraphicDB', () => {
    test('セミグラフィックデータからDBディレクティブを生成する', () => {
      // プライベートメソッドのテストのため、リフレクションを使用
      const generateSemiGraphicDB = (exporter as any).generateSemiGraphicDB.bind(exporter);

      const mockSemiData: SemiGraphicData = {
        width: 2,
        height: 1,
        blocks: [[
          { pattern: 0xFF, colorCode: 7 },
          { pattern: 0xCC, colorCode: 2 }
        ]]
      };

      const result = generateSemiGraphicDB(mockSemiData, 'TEST_DATA');

      expect(result).toContain('; セミグラフィックデータ (2x1)');
      expect(result).toContain('TEST_DATA:');
      expect(result).toContain('\tDB\t$FF, $CC');
    });

    test('大きなセミグラフィックデータで16バイトごとに改行される', () => {
      const generateSemiGraphicDB = (exporter as any).generateSemiGraphicDB.bind(exporter);

      // 20バイトのデータを作成（16バイト + 4バイト）
      const blocks: SemiGraphicBlock[][] = [[]];
      for (let i = 0; i < 20; i++) {
        blocks[0].push({ pattern: i, colorCode: 0 });
      }

      const mockSemiData: SemiGraphicData = {
        width: 20,
        height: 1,
        blocks
      };

      const result = generateSemiGraphicDB(mockSemiData, 'LARGE_DATA');
      const dbLines = result.filter((line: string) => line.includes('\tDB\t'));

      expect(dbLines).toHaveLength(2); // 16バイト + 4バイトで2行
      expect(dbLines[0].split(',').length).toBe(16); // 最初の行は16個
      expect(dbLines[1].split(',').length).toBe(4);  // 2行目は4個
    });
  });

  describe('generateColorAttributeDB', () => {
    test('カラーアトリビュートデータからDBディレクティブを生成する（新仕様）', () => {
      const generateColorAttributeDB = (exporter as any).generateColorAttributeDB.bind(exporter);

      // BWWRRBWBWBWW のパターン（例の通り）
      const mockSemiData: SemiGraphicData = {
        width: 12,
        height: 1,
        blocks: [[
          { pattern: 0, colorCode: 1 }, // B (青) - 位置0
          { pattern: 0, colorCode: 7 }, // W (白) - 位置1
          { pattern: 0, colorCode: 7 }, // W (白) - 位置2
          { pattern: 0, colorCode: 2 }, // R (赤) - 位置3
          { pattern: 0, colorCode: 2 }, // R (赤) - 位置4
          { pattern: 0, colorCode: 1 }, // B (青) - 位置5
          { pattern: 0, colorCode: 7 }, // W (白) - 位置6
          { pattern: 0, colorCode: 1 }, // B (青) - 位置7
          { pattern: 0, colorCode: 7 }, // W (白) - 位置8
          { pattern: 0, colorCode: 1 }, // B (青) - 位置9
          { pattern: 0, colorCode: 7 }, // W (白) - 位置10
          { pattern: 0, colorCode: 7 }, // W (白) - 位置11
        ]]
      };

      const result = generateColorAttributeDB(mockSemiData, 'TEST_ATTR');

      expect(result).toContain('; カラーアトリビュートデータ (12x1)');
      expect(result).toContain('TEST_ATTR:');
      
      // 変更回数と実際の座標・色の組み合わせをチェック
      const dbLine = result.find((line: string) => line.includes('\tDB\t'));
      // 期待値: DB 9, 0, $38, 1, $F8, 3, $58, 5, $38, 6, $F8, 7, $38, 8, $F8, 9, $38, 10, $F8
      // 位置0:青, 位置1:白, 位置3:赤, 位置5:青, 位置6:白, 位置7:青, 位置8:白, 位置9:青, 位置10:白
      expect(dbLine).toContain('9,'); // 変更回数
      expect(dbLine).toContain('0, $38'); // 位置0, 青
      expect(dbLine).toContain('1, $F8'); // 位置1, 白
      expect(dbLine).toContain('3, $58'); // 位置3, 赤
      expect(dbLine).toContain('5, $38'); // 位置5, 青
      expect(dbLine).toContain('6, $F8'); // 位置6, 白
      expect(dbLine).toContain('7, $38'); // 位置7, 青
      expect(dbLine).toContain('8, $F8'); // 位置8, 白
      expect(dbLine).toContain('9, $38'); // 位置9, 青
      expect(dbLine).toContain('10, $F8'); // 位置10, 白
    });

    test('先頭の白色が省略され、末尾の白色は保持される', () => {
      const generateColorAttributeDB = (exporter as any).generateColorAttributeDB.bind(exporter);

      const mockSemiData: SemiGraphicData = {
        width: 5,
        height: 1,
        blocks: [[
          { pattern: 0, colorCode: 7 }, // W (白) - 位置0（先頭の白、省略）
          { pattern: 0, colorCode: 2 }, // R (赤) - 位置1
          { pattern: 0, colorCode: 1 }, // B (青) - 位置2
          { pattern: 0, colorCode: 7 }, // W (白) - 位置3（末尾の白、保持）
          { pattern: 0, colorCode: 7 }, // W (白) - 位置4（末尾の白、保持）
        ]]
      };

      const result = generateColorAttributeDB(mockSemiData, 'TRIM_WHITE');
      const dbLine = result.find((line: string) => line.includes('\tDB\t'));
      
      // 期待値: DB 3, 1, $58, 2, $38, 3, $F8（変更回数3回、末尾の白も保持）
      expect(dbLine).toContain('3,'); // 変更回数
      expect(dbLine).toContain('1, $58'); // 位置1, 赤
      expect(dbLine).toContain('2, $38'); // 位置2, 青
      expect(dbLine).toContain('3, $F8'); // 位置3, 白（末尾の白も保持）
      expect(dbLine).not.toContain('0,'); // 先頭の白は含まれない
    });

    test('黒色（0）はスキップされる', () => {
      const generateColorAttributeDB = (exporter as any).generateColorAttributeDB.bind(exporter);

      const mockSemiData: SemiGraphicData = {
        width: 4,
        height: 1,
        blocks: [[
          { pattern: 0, colorCode: 2 }, // R (赤) - 位置0
          { pattern: 0, colorCode: 0 }, // 黒（スキップされる） - 位置1
          { pattern: 0, colorCode: 0 }, // 黒（スキップされる） - 位置2
          { pattern: 0, colorCode: 1 }, // B (青) - 位置3
        ]]
      };

      const result = generateColorAttributeDB(mockSemiData, 'SKIP_BLACK');
      const dbLine = result.find((line: string) => line.includes('\tDB\t'));
      
      // 期待値: DB 2, 0, $58, 3, $38（変更回数2回）
      expect(dbLine).toContain('2,'); // 変更回数
      expect(dbLine).toContain('0, $58'); // 位置0, 赤
      expect(dbLine).toContain('3, $38'); // 位置3, 青
      expect(dbLine).not.toContain('1,'); // 黒の位置1は含まれない
      // 「2,」が変更回数の部分にもあるため、座標部分の「2,」がないことを確認
      expect(dbLine).not.toMatch(/[^0-9]2, \$/); // 「座標2, $」のパターンがないことを確認
    });

    test('全て白色の場合は変更回数1', () => {
      const generateColorAttributeDB = (exporter as any).generateColorAttributeDB.bind(exporter);

      const mockSemiData: SemiGraphicData = {
        width: 3,
        height: 1,
        blocks: [[
          { pattern: 0, colorCode: 7 }, // W (白)
          { pattern: 0, colorCode: 7 }, // W (白)
          { pattern: 0, colorCode: 7 }, // W (白)
        ]]
      };

      const result = generateColorAttributeDB(mockSemiData, 'ALL_WHITE');
      const dbLine = result.find((line: string) => line.includes('\tDB\t'));
      
      // 期待値: DB 1, 0, $F8（変更回数1、X座標0、白色）
      expect(dbLine).toBe('\tDB\t1, 0, $F8');
    });
  });

  describe('getAttributeColorCode', () => {
    test('色コードが正しくアトリビュート値に変換される', () => {
      const getAttributeColorCode = (exporter as any).getAttributeColorCode.bind(exporter);

      expect(getAttributeColorCode(0)).toBe(0x18); // 黒
      expect(getAttributeColorCode(1)).toBe(0x38); // 青
      expect(getAttributeColorCode(2)).toBe(0x58); // 赤
      expect(getAttributeColorCode(3)).toBe(0x78); // 紫
      expect(getAttributeColorCode(4)).toBe(0x98); // 緑
      expect(getAttributeColorCode(5)).toBe(0xB8); // 水色
      expect(getAttributeColorCode(6)).toBe(0xD8); // 黄色
      expect(getAttributeColorCode(7)).toBe(0xF8); // 白
    });

    test('範囲外の色コードはデフォルト値を返す', () => {
      const getAttributeColorCode = (exporter as any).getAttributeColorCode.bind(exporter);

      expect(getAttributeColorCode(8)).toBe(0xF8);  // デフォルト（白）
      expect(getAttributeColorCode(-1)).toBe(0xF8); // デフォルト（白）
    });
  });

  describe('generateZ80Code', () => {
    test('完全なZ80アセンブリコードが生成される', () => {
      const generateZ80Code = (exporter as any).generateZ80Code.bind(exporter);

      const result = generateZ80Code(mockProjectData);

      // ヘッダー情報の確認
      expect(result).toContain('Z80 Dancing Editor Generated Assembly Code');
      expect(result).toContain(`Project: ${mockProjectData.name}`);
      expect(result).toContain(`Canvas Size: ${mockProjectData.settings.canvasWidth}x${mockProjectData.settings.canvasHeight}`);
      expect(result).toContain(`Images: ${mockProjectData.images.length}`);
      expect(result).toContain(`Sequences: ${mockProjectData.sequences.length}`);

      // セクションの確認
      expect(result).toContain('=== Image Data Section ===');
      expect(result).toContain('=== Animation Sequences ===');
      expect(result).toContain('=== End of Generated Code ===');
    });

    test('画像が存在する場合にセミグラフィックデータが含まれる', () => {
      const generateZ80Code = (exporter as any).generateZ80Code.bind(exporter);

      const projectWithImages = {
        ...mockProjectData,
        images: [{
          id: '001',
          filename: 'test.png',
          width: 32,
          height: 32,
          imageElement: createMockImageElement()
        }]
      };

      const result = generateZ80Code(projectWithImages);

      expect(result).toContain('Image_001:');
      expect(result).toContain('Attr_001:');
      expect(result).toContain('Image: test.png (32x32)');
    });

    test('シーケンスが存在する場合にアニメーションデータが含まれる', () => {
      const generateZ80Code = (exporter as any).generateZ80Code.bind(exporter);

      const result = generateZ80Code(mockProjectData);

      expect(result).toContain('Sequence: Test Animation');
      expect(result).toContain('Frames: 2, Loop: true');
      expect(result).toContain('dw\tImage_001');
      expect(result).toContain('db\t50, 100');  // Y, X
      expect(result).toContain('db\t10');       // ウェイト
    });

    test('空のプロジェクトの場合に適切なメッセージが含まれる', () => {
      const generateZ80Code = (exporter as any).generateZ80Code.bind(exporter);

      const emptyProject = {
        ...mockProjectData,
        images: [],
        sequences: []
      };

      const result = generateZ80Code(emptyProject);

      expect(result).toContain('No images in project');
      expect(result).toContain('No sequences in project');
    });
  });

  describe('getSemiGraphicConverter', () => {
    test('セミグラフィックコンバーターのインスタンスを返す', () => {
      const converter = exporter.getSemiGraphicConverter();
      expect(converter).toBeDefined();
      expect(converter.convertImageToSemiGraphic).toBeDefined();
    });
  });

  describe('静的メソッド', () => {
    test('getSupportedFormats が正しい形式を返す', () => {
      const formats = Z80Exporter.getSupportedFormats();
      expect(formats).toEqual(['asm']);
    });

    test('getFileExtension が正しい拡張子を返す', () => {
      const extension = Z80Exporter.getFileExtension();
      expect(extension).toBe('.asm');
    });
  });
});

// ヘルパー関数
function createMockProjectData(): ProjectData {
  return {
    name: 'Test Project',
    version: '1.0.0',
    images: [
      {
        id: '001',
        filename: 'image1.png',
        width: 32,
        height: 32,
        imageElement: createMockImageElement()
      }
    ],
    sequences: [
      {
        name: 'Test Animation',
        loop: true,
        frames: [
          { imageId: '001', x: 100, y: 50, waitTime: 10 },
          { imageId: '001', x: 120, y: 60, waitTime: 15 }
        ]
      }
    ],
    settings: {
      canvasWidth: 256,
      canvasHeight: 192,
      defaultFrameRate: 60,
      backgroundColor: '#000000'
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };
}

function createMockImageElement(): any {
  return {
    getImageData: jest.fn().mockReturnValue({
      width: 2,
      height: 4,
      data: new Uint8ClampedArray([
        255, 255, 255, 255,  255, 255, 255, 255,  // Row 0: white, white
        255, 0, 0, 255,      255, 0, 0, 255,      // Row 1: red, red
        0, 255, 0, 255,      0, 255, 0, 255,      // Row 2: green, green
        0, 0, 255, 255,      0, 0, 255, 255,      // Row 3: blue, blue
      ])
    })
  };
}
