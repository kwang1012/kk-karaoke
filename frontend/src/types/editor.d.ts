// TypeScript users only add this code
import { BaseEditor, Descendant, ElementInterface } from 'slate';
import { ReactEditor } from 'slate-react';

type ElementType = 'lrc-line' | 'timestamp' | string;
type CustomElement = { type: ElementType; children: (CustomElement | CustomText)[] };
type CustomText = { text: string };

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
