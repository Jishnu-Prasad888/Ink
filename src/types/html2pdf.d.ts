declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number];
    filename?: string;
    image?: {
      type?: "jpeg" | "png" | "webp";
      quality?: number;
    };
    enableLinks?: boolean;
    html2canvas?: object;
    jsPDF?: {
      unit?: string;
      format?: string | [number, number];
      orientation?: "portrait" | "landscape";
    };
    pagebreak?: {
      mode?: string | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }

  interface Html2PdfWorker {
    from(src: HTMLElement | string | HTMLCanvasElement | HTMLImageElement): this;
    to(target: "container" | "canvas" | "img" | "pdf"): this;
    toContainer(): this;
    toCanvas(): this;
    toImg(): this;
    toPdf(): this;
    output(type?: string, options?: any, src?: "pdf" | "img"): Promise<any>;
    outputPdf(type?: string, options?: any): Promise<any>;
    outputImg(type?: string, options?: any): Promise<any>;
    save(filename?: string): Promise<void>;
    set(options: Html2PdfOptions): this;
    get(key: string, cbk?: (value: any) => void): Promise<any>;
    then<T>(onFulfilled?: (value: any) => T | PromiseLike<T>, onRejected?: (reason: any) => any): Promise<T>;
    catch<T>(onRejected?: (reason: any) => T | PromiseLike<T>): Promise<T>;
  }

  interface Html2PdfStatic {
    (): Html2PdfWorker;
    new (): Html2PdfWorker;
    (element: HTMLElement, options?: Html2PdfOptions): Promise<void>;
    new (element: HTMLElement, options?: Html2PdfOptions): Promise<void>;
    Worker: new () => Html2PdfWorker;
  }

  const html2pdf: Html2PdfStatic;
  export default html2pdf;
}
