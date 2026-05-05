// Shim for node:stream/web — browsers have native web streams
export const ReadableStream = globalThis.ReadableStream;
export const WritableStream = globalThis.WritableStream;
export const TransformStream = globalThis.TransformStream;
export const ReadableStreamDefaultReader = globalThis.ReadableStreamDefaultReader;
export const ReadableStreamBYOBReader = globalThis.ReadableStreamBYOBReader;
export const ReadableStreamDefaultController = globalThis.ReadableStreamDefaultController;
export const ReadableByteStreamController = globalThis.ReadableByteStreamController;
export const WritableStreamDefaultWriter = globalThis.WritableStreamDefaultWriter;
export const WritableStreamDefaultController = globalThis.WritableStreamDefaultController;
export const TransformStreamDefaultController = globalThis.TransformStreamDefaultController;
export const ByteLengthQueuingStrategy = globalThis.ByteLengthQueuingStrategy;
export const CountQueuingStrategy = globalThis.CountQueuingStrategy;
