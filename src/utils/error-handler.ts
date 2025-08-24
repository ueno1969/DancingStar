/**
 * アプリケーション全体で使用するエラー処理ユーティリティ
 */

export class ErrorHandler {
  /**
   * エラーをログに記録し、ユーザーフレンドリーなメッセージに変換
   */
  static handleError(error: unknown, context: string): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${context}]`, error);
    
    // よくあるエラーパターンに対するユーザーフレンドリーなメッセージ
    if (errorMessage.includes('ENOENT')) {
      return 'ファイルが見つかりません。';
    }
    if (errorMessage.includes('EACCES')) {
      return 'ファイルへのアクセス権限がありません。';
    }
    if (errorMessage.includes('JSON')) {
      return 'ファイル形式が正しくありません。';
    }
    
    return errorMessage;
  }

  /**
   * 非同期処理のエラーをキャッチして処理
   */
  static async safeAsync<T>(
    operation: () => Promise<T>, 
    context: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const message = ErrorHandler.handleError(error, context);
      console.error(`Safe async error in ${context}:`, message);
      return fallback;
    }
  }
}
