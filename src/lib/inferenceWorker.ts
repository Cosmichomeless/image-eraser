import * as ort from "onnxruntime-web";

// Configure wasm paths to use CDN (bypasses Next.js Turbopack bugs with serving .mjs files from public folder)
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/";

// We'll keep a reference to the loaded session to reuse it
let session: ort.InferenceSession | null = null;
let isInitializing = false;

// We use a reliable public CDN (Hugging Face) to host the 198MB LaMa model so it doesn't need to be in the repo
const MODEL_PATH = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";

async function initModel() {
    if (session || isInitializing) return;
    isInitializing = true;
    try {
        session = await ort.InferenceSession.create(MODEL_PATH, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
        });
        self.postMessage({ type: "init-done" });
    } catch (error) {
        console.warn("WebGPU failed, falling back to Wasm", error);
        try {
            session = await ort.InferenceSession.create(MODEL_PATH, {
                executionProviders: ["wasm"],
                graphOptimizationLevel: "all",
            });
            self.postMessage({ type: "init-done" });
        } catch (fallbackError: any) {
            console.error("Failed to load model:", fallbackError);
            const errMsg = fallbackError?.message || fallbackError?.toString() || "Unknown error";
            self.postMessage({ type: "error", error: "Failed to load ONNX model. Reason: " + errMsg });
        }
    } finally {
        isInitializing = false;
    }
}

// Helper to convert DataURL to ImageData
async function getImageDataFromURL(url: string, width: number, height: number): Promise<ImageData> {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, width, height);
}

// Preprocess: Convert ImageData to Tensor [1, C, H, W]
function preprocess(imgData: ImageData, isMask: boolean): ort.Tensor {
    const { width, height, data } = imgData;
    const channels = isMask ? 1 : 3;
    const float32Data = new Float32Array(1 * channels * height * width);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (isMask) {
                // grayscale mask > 0 means masked
                const val = data[idx] > 0 ? 1.0 : 0.0;
                float32Data[y * width + x] = val;
            } else {
                // RGB
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // normalize to [0, 1] usually or depending on lama model [-1, 1].
                // LaMa standard is usually [0, 1] then scaled within model, but standard is often [0, 1] or raw 0-255 based on export.
                float32Data[0 * width * height + y * width + x] = r / 255.0;
                float32Data[1 * width * height + y * width + x] = g / 255.0;
                float32Data[2 * width * height + y * width + x] = b / 255.0;
            }
        }
    }

    return new ort.Tensor("float32", float32Data, [1, channels, height, width]);
}

// Postprocess: Tensor [1, 3, H, W] back to DataURL
function postprocess(tensor: ort.Tensor, width: number, height: number): string {
    const data = tensor.data as Float32Array;
    const imgData = new ImageData(width, height);

    // Determine scale: if values are mostly 0-1, multiply by 255. If they are > 2, assume they are 0-255.
    let isNormalized = false;
    for (let i = 0; i < 100; i++) {
        if (data[i] > 2.0) {
            isNormalized = true;
            break;
        }
    }
    const scale = isNormalized ? 1.0 : 255.0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const r = Math.max(0, Math.min(255, data[0 * width * height + y * width + x] * scale));
            const g = Math.max(0, Math.min(255, data[1 * width * height + y * width + x] * scale));
            const b = Math.max(0, Math.min(255, data[2 * width * height + y * width + x] * scale));

            const idx = (y * width + x) * 4;
            imgData.data[idx] = r;
            imgData.data[idx + 1] = g;
            imgData.data[idx + 2] = b;
            imgData.data[idx + 3] = 255;
        }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.putImageData(imgData, 0, 0);

    // Convert OffscreenCanvas to blob to base64 using FileReader
    return new Promise<string>((resolve) => {
        canvas.convertToBlob({ type: "image/png" }).then((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }) as any;
}

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === "init") {
        await initModel();
    }

    if (type === "process") {
        try {
            if (!session) {
                await initModel();
            }
            if (!session) {
                throw new Error("Model not initialized.");
            }

            const { imageSrc, maskSrc } = payload;
            const targetSize = 512;

            // 1. Convert URLs to ImageData
            const imgData = await getImageDataFromURL(imageSrc, targetSize, targetSize);
            const maskData = await getImageDataFromURL(maskSrc, targetSize, targetSize);

            // 2. Preprocess to Tensors
            const imageTensor = preprocess(imgData, false);
            const maskTensor = preprocess(maskData, true);

            // 3. Inference
            // Note: LaMa model tensor names are typically "image" and "mask"
            const feeds: Record<string, ort.Tensor> = {};
            const expectedInputNames = session.inputNames;

            // Attempt to map dynamically, default LaMa is usually 'image' and 'mask'
            const imageInputName = expectedInputNames.find((n) => n.toLowerCase().includes("image") || n === "x") || expectedInputNames[0];
            const maskInputName = expectedInputNames.find((n) => n.toLowerCase().includes("mask")) || expectedInputNames[1];

            console.log("Image Tensor Size:", imageTensor.dims);
            console.log("Mask Tensor Size:", maskTensor.dims);
            console.log("Input Names Expected:", expectedInputNames);

            feeds[imageInputName] = imageTensor;
            feeds[maskInputName] = maskTensor;

            const outputMap = await session.run(feeds);

            // Log outputs
            console.log("Output map:", outputMap);

            // LaMa outputs are usually named "output" or similar. We just grab the first output.
            const outputTensor = outputMap[session.outputNames[0]];

            // 4. Postprocess Back to Image
            const resultDataUrl = await postprocess(outputTensor, targetSize, targetSize);

            self.postMessage({ type: "result", payload: resultDataUrl });
        } catch (error: any) {
            console.error(error);
            self.postMessage({ type: "error", error: error.message || "An error occurred during inference." });
        }
    }
};
