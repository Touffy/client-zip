type BufferLike = ArrayBuffer | string | ArrayBufferView
type StreamLike = Blob | ReadableStream<Uint8Array> | AsyncIterable<BufferLike>

/** The file name and modification date will be read from the input;
 * extra arguments can be given to override the input's metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?: any, lastModified?: any}

/** The file name must be provided with those types of input, and modification date can't be guessed. */
type InputWithoutMeta = { input: BufferLike | StreamLike, name: any, lastModified?: any }

type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

export declare function downloadZip(files: ForAwaitable<InputWithMeta | InputWithoutMeta>): Response

/** Load the SIMD-enabled CRC32 module for improved performance.
 * @param url the location of the crc32x4.wasm file ; by default, it should be next to the client-zip index */
export declare function useSimd(url?: string | URL): Promise<void>
