declare module 'qrcode' {
  interface QRCodeOptions {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }
  
  export function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
}

declare module 'crypto-js' {
  export namespace lib {
    export class WordArray {
      static random(nBytes: number): WordArray;
      toString(): string;
    }
  }
  
  export namespace enc {
    export const Utf8: any;
    export const Hex: any;
  }
  
  export namespace mode {
    export const CBC: any;
  }
  
  export namespace pad {
    export const Pkcs7: any;
  }
  
  export const AES: {
    encrypt(message: string, key: string, cfg?: any): any;
    decrypt(ciphertext: any, key: string, cfg?: any): any;
  };
  
  export function PBKDF2(password: string, salt: string, cfg?: any): WordArray;
  export function SHA256(message: string): WordArray;
}