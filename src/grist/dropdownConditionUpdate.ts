import { isDeepStrictEqual } from "node:util";
import { nativeDropdownConditionState } from "./formInspection.js";

type JsonRecord = Record<string, unknown>;
export type NativeDropdownCondition = { text: string; parsed: string };

/** One-column read-modify-write plan; unknown option keys remain untouched. */
export function planDropdownConditionUpdate(
  before: JsonRecord, condition: NativeDropdownCondition | null
): { options: JsonRecord; widgetOptions: string; changed: boolean } {
  if (Object.hasOwn(before, "dropdownCondition") &&
      nativeDropdownConditionState(before.dropdownCondition) !== "protected") {
    throw new Error("Existing native dropdown condition is malformed; refusing overwrite.");
  }
  const options = { ...before };
  if (condition === null) delete options.dropdownCondition;
  else options.dropdownCondition = condition;
  const widgetOptions = JSON.stringify(options);
  if (widgetOptions.length > 16_384) {
    throw new Error("Updated dropdown options exceed the native read bound.");
  }
  return { options, widgetOptions, changed: !isDeepStrictEqual(before, options) };
}
