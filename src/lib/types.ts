export type TextAlign = "right" | "center" | "left";
export type BoxShape = "rect" | "ellipse";

/** Box geometry is stored as fractions (0-1) of the page so it survives any display size. */
export type TextBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  original: string;
  text: string;
  kind: string;
  fontFamily: string;
  /** Font size in source-image pixels. */
  fontSize: number;
  bold: boolean;
  align: TextAlign;
  lineHeight: number;
  color: string;
  bg: string;
  /** When false the box draws only text, no cover fill. */
  fill: boolean;
  shape: BoxShape;
  strokeColor: string;
  /** Text outline width in source-image pixels; 0 disables it. */
  strokeWidth: number;
};

export type PageStatus = "pending" | "processing" | "done" | "error";

export type Page = {
  id: string;
  chapterId: string;
  name: string;
  width: number;
  height: number;
  status: PageStatus;
  error?: string | undefined;
  boxes: TextBox[];
  updatedAt: number;
};

export type Chapter = {
  id: string;
  title: string;
  notes: string;
  pageIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type CustomFont = {
  id: string;
  family: string;
  fileName: string;
};
