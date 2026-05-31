export type StructuredLogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StructuredLogRecord
  | StructuredLogValue[];

export interface StructuredLogRecord {
  [key: string]: StructuredLogValue;
}
