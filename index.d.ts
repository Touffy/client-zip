type BufferLike = ArrayBuffer | string | ArrayBufferView
type StreamLike = Blob | ReadableStream<Uint8Array> | AsyncIterable<BufferLike>

/** The file name and modification date will be read from the input;
 * extra arguments can be given to override the input's metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?, lastModified?}

/** The file name and modification must be provided with those types of input. */
type InputWithoutMeta = { input: BufferLike | StreamLike, name, lastModified }

export declare function downloadZip(files: AsyncIterable<InputWithMeta | InputWithoutMeta>): Response
