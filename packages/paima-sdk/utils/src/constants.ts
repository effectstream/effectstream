export const DYNAMIC_PRIMITIVE_NAME_SEPARATOR = "##";
export function generateDynamicPrimitivePrefix(parentName: string): string {
  return `${parentName}${DYNAMIC_PRIMITIVE_NAME_SEPARATOR}`;
}
export function generateDynamicPrimitiveName(
  parentName: string,
  id: number,
): string {
  return `${generateDynamicPrimitivePrefix(parentName)}${id}`;
}
