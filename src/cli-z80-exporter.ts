#!/usr/bin/env node

/**
 * Z80 Dancing Editor CLI Z80 Exporter
 * コマンドラインからプロジェクトファイルを読み込み、Z80アセンブリコードを生成するツール
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectData } from './types/project';
import { Z80Exporter } from './z80-exporter';
import { CliImageLoader } from './cli-image-loader';

/**
 * 使用方法を表示
 */
function showUsage(): void {
  console.log('使用方法:');
  console.log('  npm run create:z80 <プロジェクトファイル> <出力.asm>');
  console.log('');
  console.log('例:');
  console.log('  npm run create:z80 001.zdp output.asm');
  console.log('  npm run create:z80 my_project.zdp dancing_code.asm');
  console.log('');
  console.log('引数:');
  console.log('  <プロジェクトファイル>  .zdp形式のプロジェクトファイル');
  console.log('  <出力.asm>           出力するZ80アセンブリファイル');
}

/**
 * ファイルの存在確認
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * プロジェクトファイルを読み込み
 */
function loadProjectFile(filePath: string): ProjectData | null {
  try {
    if (!fileExists(filePath)) {
      console.error(`エラー: プロジェクトファイルが見つかりません: ${filePath}`);
      return null;
    }

    const projectJson = fs.readFileSync(filePath, 'utf8');
    const projectData = JSON.parse(projectJson) as ProjectData;

    // 基本的な妥当性チェック
    if (!projectData.name || !projectData.version || !Array.isArray(projectData.images) || !Array.isArray(projectData.sequences)) {
      console.error(`エラー: 無効なプロジェクトファイル形式: ${filePath}`);
      return null;
    }

    console.log(`プロジェクト読み込み成功: ${projectData.name} (v${projectData.version})`);
    console.log(`  画像数: ${projectData.images?.length || 0}`);
    console.log(`  シーケンス数: ${projectData.sequences?.length || 0}`);

    return projectData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`エラー: プロジェクトファイルの読み込みに失敗: ${errorMessage}`);
    return null;
  }
}

/**
 * 出力ディレクトリを確保
 */
function ensureOutputDirectory(outputPath: string): boolean {
  try {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`出力ディレクトリを作成: ${outputDir}`);
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`エラー: 出力ディレクトリの作成に失敗: ${errorMessage}`);
    return false;
  }
}

/**
 * CLI環境で画像を読み込んでプロジェクトデータに設定
 */
async function loadImagesForProject(projectData: ProjectData, projectPath: string): Promise<boolean> {
  const imageLoader = new CliImageLoader();
  let allSuccess = true;

  console.log(`プロジェクト内の画像を読み込み中... (${projectData.images.length}個)`);

  for (const imageResource of projectData.images) {
    console.log(`  - ${imageResource.filename}`);
    
    // 画像ファイルのパスを解決
    const imagePath = imageLoader.findImageFile(projectPath, imageResource.filename);
    if (!imagePath) {
      console.warn(`    警告: 画像ファイルが見つかりません: ${imageResource.filename}`);
      allSuccess = false;
      continue;
    }

    // 画像データを読み込み
    const imageData = await imageLoader.loadImage(imagePath);
    if (!imageData) {
      console.warn(`    警告: 画像の読み込みに失敗: ${imageResource.filename}`);
      allSuccess = false;
      continue;
    }

    // HTMLImageElementに相当するオブジェクトを作成
    // CLI環境では実際のHTMLImageElementは作成できないため、
    // 必要な属性のみを持つオブジェクトを作成
    const mockImageElement: any = {
      width: imageData.width,
      height: imageData.height,
      // セミグラフィック変換で必要になるピクセルデータアクセス用のメソッド
      getImageData: () => ({
        width: imageData.width,
        height: imageData.height,
        data: imageData.data
      })
    };

    // プロジェクトデータに設定
    imageResource.imageElement = mockImageElement;
    console.log(`    読み込み完了: ${imageData.width}x${imageData.height}`);
  }

  if (allSuccess) {
    console.log('すべての画像の読み込みが完了しました。');
  } else {
    console.log('一部の画像の読み込みに失敗しました。');
  }

  return allSuccess;
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 引数チェック
  if (args.length !== 2) {
    console.error('エラー: 引数が不正です。');
    showUsage();
    process.exit(1);
  }

  const [projectFile, outputFile] = args;

  // 絶対パスに変換
  const projectPath = path.resolve(projectFile);
  const outputPath = path.resolve(outputFile);

  console.log('Z80 Dancing Editor CLI Z80 Exporter');
  console.log('===================================');
  console.log(`入力ファイル: ${projectPath}`);
  console.log(`出力ファイル: ${outputPath}`);
  console.log('');

  // プロジェクトファイルを読み込み
  const projectData = loadProjectFile(projectPath);
  if (!projectData) {
    process.exit(1);
  }

  // プロジェクト内の画像を読み込み
  const imagesLoaded = await loadImagesForProject(projectData, projectPath);
  if (!imagesLoaded) {
    console.warn('画像の読み込みに問題がありましたが、処理を続行します。');
  }

  // 出力ディレクトリを確保
  if (!ensureOutputDirectory(outputPath)) {
    process.exit(1);
  }

  // Z80エクスポーターを初期化
  const exporter = new Z80Exporter();

  try {
    console.log('Z80コード生成中...');
    
    // Z80コードを生成・出力
    const result = await exporter.exportProject(projectData, {
      outputPath: outputPath
    });

    if (result.success) {
      console.log('');
      console.log('Z80コード生成完了!');
      console.log(`  出力ファイル: ${result.outputPath}`);
      console.log(`  生成行数: ${result.linesGenerated}行`);
      console.log(`  ファイルサイズ: ${result.sizeBytes}バイト`);
      console.log('');
      console.log('アセンブリコードが正常に生成されました。');
    } else {
      console.error('');
      console.error('Z80コード生成エラー:', result.error);
      process.exit(1);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('');
    console.error('予期しないエラーが発生しました:', errorMessage);
    process.exit(1);
  }
}

// プログラム実行
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
