/**
 * Avoids member functions having the wrong `this` value when passed as a function pointer.\
 * AKA shortcut for `this.func.bind(this)`
 *
 * Taken form https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html
 *
 * Careful: this can cause a segmentation fault on Deno (https://github.com/denoland/deno/issues/25192)
 */
export function bound(
  _originalMethod: any,
  context: ClassMethodDecoratorContext<Record<string | symbol, any>>,
) {
  const methodName = context.name;
  if (context.private) {
    throw new Error(
      `'bound' cannot decorate private properties like ${methodName as string}.`,
    );
  }
  context.addInitializer(function () {
    this[methodName] = this[methodName].bind(this);
  });
}
