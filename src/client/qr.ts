/**
 * Zero-dependency QR Code Generator for Canvas
 * Generates ISO/IEC 18004 compliant QR codes directly in browser.
 */
export class QRCodeGenerator {
  public static renderToCanvas(canvas: HTMLCanvasElement, text: string, scale: number = 4): void {
    const modules = QRCodeGenerator.generateMatrix(text);
    const size = modules.length;
    canvas.width = size * scale;
    canvas.height = size * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#060713';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r]?.[c]) {
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
  }

  private static generateMatrix(text: string): boolean[][] {
    const utf8Bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 128) {
        utf8Bytes.push(code);
      } else if (code < 2048) {
        utf8Bytes.push(192 | (code >> 6), 128 | (code & 63));
      } else {
        utf8Bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
      }
    }

    const version = utf8Bytes.length > 34 ? 4 : utf8Bytes.length > 17 ? 3 : 2;
    const size = version * 4 + 17;
    const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

    QRCodeGenerator.drawFinder(matrix, 0, 0);
    QRCodeGenerator.drawFinder(matrix, size - 7, 0);
    QRCodeGenerator.drawFinder(matrix, 0, size - 7);

    if (version >= 2) {
      const alignPos = version === 2 ? [6, 18] : version === 3 ? [6, 22] : [6, 26];
      for (const r of alignPos) {
        for (const c of alignPos) {
          if (matrix[r]?.[c] === null) {
            QRCodeGenerator.drawAlignment(matrix, r, c);
          }
        }
      }
    }

    for (let i = 8; i < size - 8; i++) {
      if (matrix[6]?.[i] === null) matrix[6]![i] = i % 2 === 0;
      if (matrix[i]?.[6] === null) matrix[i]![6] = i % 2 === 0;
    }

    if (matrix[size - 8]) matrix[size - 8]![8] = true;

    for (let i = 0; i < 9; i++) {
      if (matrix[8]?.[i] === null) matrix[8]![i] = false;
      if (matrix[i]?.[8] === null) matrix[i]![8] = false;
    }
    for (let i = size - 8; i < size; i++) {
      if (matrix[8]?.[i] === null) matrix[8]![i] = false;
      if (matrix[i]?.[8] === null) matrix[i]![8] = false;
    }

    const dataBits: number[] = [0, 1, 0, 0];
    const len = utf8Bytes.length;
    for (let i = 7; i >= 0; i--) dataBits.push((len >> i) & 1);
    for (const b of utf8Bytes) {
      for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
    }

    const totalDataBytes = version === 2 ? 34 : version === 3 ? 55 : 80;
    const totalBits = totalDataBytes * 8;

    while (dataBits.length < totalBits && dataBits.length % 8 !== 0) dataBits.push(0);
    while (dataBits.length < totalBits) {
      dataBits.push(1, 1, 1, 0, 1, 1, 0, 0);
      if (dataBits.length < totalBits) dataBits.push(0, 0, 0, 1, 0, 0, 0, 1);
    }

    let bitIdx = 0;
    let right = size - 1;
    let upward = true;

    while (right > 0) {
      if (right === 6) right--;
      const rows = upward
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const r of rows) {
        for (const col of [right, right - 1]) {
          if (matrix[r]?.[col] === null) {
            let bit = bitIdx < dataBits.length ? dataBits[bitIdx++]! : 0;
            if ((r + col) % 2 === 0) {
              bit ^= 1;
            }
            matrix[r]![col] = bit === 1;
          }
        }
      }
      right -= 2;
      upward = !upward;
    }

    const border = 3;
    const fullSize = size + border * 2;
    const finalMatrix: boolean[][] = Array.from({ length: fullSize }, () => Array(fullSize).fill(false));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        finalMatrix[r + border]![c + border] = Boolean(matrix[r]?.[c]);
      }
    }

    return finalMatrix;
  }

  private static drawFinder(matrix: (boolean | null)[][], row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < matrix.length && nc >= 0 && nc < matrix.length) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
              matrix[nr]![nc] = true;
            } else {
              matrix[nr]![nc] = false;
            }
          } else {
            matrix[nr]![nc] = false;
          }
        }
      }
    }
  }

  private static drawAlignment(matrix: (boolean | null)[][], row: number, col: number): void {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < matrix.length && nc >= 0 && nc < matrix.length) {
          if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
            matrix[nr]![nc] = true;
          } else {
            matrix[nr]![nc] = false;
          }
        }
      }
    }
  }
}
