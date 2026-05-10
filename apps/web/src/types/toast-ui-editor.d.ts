declare module "@toast-ui/editor" {
  export interface EditorOptions {
    el: HTMLElement;
    height?: string;
    initialEditType?: "markdown" | "wysiwyg";
    previewStyle?: "tab" | "vertical";
    initialValue?: string;
    usageStatistics?: boolean;
    hideModeSwitch?: boolean;
    toolbarItems?: unknown;
    hooks?: {
      addImageBlobHook?: (blob: Blob, callback: (url: string, altText?: string) => void) => boolean | void;
    };
  }

  export class Editor {
    constructor(options: EditorOptions);
    on(eventName: string, handler: () => void): void;
    getMarkdown(): string;
    destroy(): void;
  }
}
