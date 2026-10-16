export function cloneRecipe<T>(r: T): T {
  return JSON.parse(JSON.stringify(r)) as T;
}
