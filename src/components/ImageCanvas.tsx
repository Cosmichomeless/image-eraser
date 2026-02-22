"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Upload, Eraser, Undo, Loader2, Download } from "lucide-react";
import { useInference } from "@/hooks/useInference";

export default function ImageCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);

  // Offscreen canvas to store the pure mask (black background, white drawing)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Coordinates for the current active crop so we know where to paste the result
  const [cropBox, setCropBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const { processImage, isProcessing, resultImage, error } = useInference();

  useEffect(() => {
    if (typeof document !== "undefined" && !maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement("canvas");
      maskCtxRef.current = maskCanvasRef.current.getContext("2d", { willReadFrequently: true });
    }
  }, []);

  const redraw = useCallback(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Overlay the drawn mask on top (we'll manually tint it red)
    if (maskCanvasRef.current) {
      ctx.save();
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext("2d");
      if (tCtx) {
        // Draw the transparent mask (which has white strokes)
        tCtx.drawImage(maskCanvasRef.current, 0, 0);

        // Change white to red
        tCtx.globalCompositeOperation = "source-in";
        tCtx.fillStyle = "rgba(255, 0, 0, 0.5)";
        tCtx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the red tinted strokes onto the main canvas
        ctx.drawImage(tempCanvas, 0, 0);
      }
      ctx.restore();
    }
  }, [image]);

  const clearMask = useCallback(() => {
    if (!maskCanvasRef.current || !maskCtxRef.current || !image) return;
    const mCtx = maskCtxRef.current;
    mCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    redraw();
  }, [image, redraw]);

  const drawImageFit = useCallback(() => {
    if (!canvasRef.current || !image || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Set actual resolution to image's native resolution to prevent pixelation
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Also resize mask canvas if needed to match true resolution
    if (maskCanvasRef.current && (maskCanvasRef.current.width !== canvas.width || maskCanvasRef.current.height !== canvas.height)) {
      maskCanvasRef.current.width = canvas.width;
      maskCanvasRef.current.height = canvas.height;
      clearMask();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Overlay mask if exists
    if (maskCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.restore();
    }
  }, [image, clearMask]);

  useEffect(() => {
    drawImageFit();
    window.addEventListener("resize", drawImageFit);
    return () => window.removeEventListener("resize", drawImageFit);
  }, [drawImageFit]);

  useEffect(() => {
    // If result image exists, composite it with the original high-res image
    if (resultImage && image && maskCanvasRef.current && cropBox) {
      const resultImg = new Image();
      resultImg.onload = () => {
        // Create a canvas at original resolution
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // 1. Draw original image
        ctx.drawImage(image, 0, 0);

        // 2. Prepare the upscaled patched cutout
        const tempPatchCanvas = document.createElement("canvas");
        tempPatchCanvas.width = cropBox.w;
        tempPatchCanvas.height = cropBox.h;
        const tempCtx = tempPatchCanvas.getContext("2d");

        if (tempCtx && maskCanvasRef.current) {
          // Draw upscaled AI result over the temp canvas (which is cropBox sized)
          tempCtx.drawImage(resultImg, 0, 0, cropBox.w, cropBox.h);

          // Mask it: keep only pixels where the transparent mask has strokes
          tempCtx.globalCompositeOperation = "destination-in";
          tempCtx.drawImage(
            maskCanvasRef.current,
            cropBox.x, cropBox.y, cropBox.w, cropBox.h, // Source (from drawn mask)
            0, 0, cropBox.w, cropBox.h                  // Destination
          );

          // Patch the cutout perfectly over the original image
          ctx.drawImage(tempPatchCanvas, cropBox.x, cropBox.y);
        }

        // Update the main image state with the newly patched high-res image
        const finalImg = new Image();
        finalImg.onload = () => {
          setImage(finalImg);
          clearMask();
          setCropBox(null);
        };
        finalImg.src = canvas.toDataURL("image/png");
      };
      resultImg.src = resultImage;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultImage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Mobile browsers crash with huge 4K+ canvases in RAM. Cap to 2048px maximum dimension.
        const MAX_DIMENSION = 2048;
        if (img.naturalWidth > MAX_DIMENSION || img.naturalHeight > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / img.naturalWidth, MAX_DIMENSION / img.naturalHeight);
          const newWidth = Math.round(img.naturalWidth * ratio);
          const newHeight = Math.round(img.naturalHeight * ratio);

          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = newWidth;
          tempCanvas.height = newHeight;
          const ctx = tempCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            const downscaledImg = new Image();
            downscaledImg.onload = () => setImage(downscaledImg);
            downscaledImg.src = tempCanvas.toDataURL("image/jpeg", 0.95);
            return;
          }
        }

        setImage(img);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!maskCtxRef.current || !canvasRef.current) return;
    setIsDrawing(true);

    const { x, y } = getCoordinates(e);

    maskCtxRef.current.beginPath();
    maskCtxRef.current.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !maskCtxRef.current || !canvasRef.current) return;

    const { x, y } = getCoordinates(e);

    const mCtx = maskCtxRef.current;
    mCtx.lineTo(x, y);
    mCtx.lineCap = "round";
    mCtx.lineJoin = "round";
    // Scale brush size up according to canvas actual resolution vs visual size
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    mCtx.lineWidth = brushSize * scaleX;
    mCtx.strokeStyle = "white";
    mCtx.stroke();

    redraw();
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !maskCtxRef.current) return;
    setIsDrawing(false);
    maskCtxRef.current.closePath();
  };

  const handleErase = async () => {
    if (!image || !maskCanvasRef.current || !canvasRef.current) return;

    // 1. Find the bounding box of the drawn mask
    const maskCtx = maskCanvasRef.current.getContext("2d");
    if (!maskCtx) return;
    const imgData = maskCtx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);

    let minX = maskCanvasRef.current.width;
    let minY = maskCanvasRef.current.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    // The mask is transparent (alpha = 0) where empty, and white where drawn
    for (let y = 0; y < maskCanvasRef.current.height; y++) {
      for (let x = 0; x < maskCanvasRef.current.width; x++) {
        const alpha = imgData.data[(y * maskCanvasRef.current.width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }

    if (!found) return; // Nothing drawn

    // Add 15% padding around the mask so the AI has context
    const padding = Math.max((maxX - minX) * 0.15, (maxY - minY) * 0.15, 30);
    const boxX = Math.max(0, Math.floor(minX - padding));
    const boxY = Math.max(0, Math.floor(minY - padding));
    const boxW = Math.min(maskCanvasRef.current.width - boxX, Math.ceil((maxX - minX) + padding * 2));
    const boxH = Math.min(maskCanvasRef.current.height - boxY, Math.ceil((maxY - minY) + padding * 2));

    // Force square aspect ratio for the LaMa model (optional but recommended for 512x512)
    const size = Math.max(boxW, boxH);
    const finalW = Math.min(size, maskCanvasRef.current.width - boxX);
    const finalH = Math.min(size, maskCanvasRef.current.height - boxY);

    // Save box globally to paste the result safely
    setCropBox({ x: boxX, y: boxY, w: finalW, h: finalH });

    // 2. Crop the image to just the padded bounding box and scale to 512x512
    const scaledImgCanvas = document.createElement("canvas");
    scaledImgCanvas.width = 512;
    scaledImgCanvas.height = 512;
    const siCtx = scaledImgCanvas.getContext("2d");
    if (!siCtx) return;
    siCtx.drawImage(image, boxX, boxY, finalW, finalH, 0, 0, 512, 512);

    // 3. Crop the mask to just the padded bounding box, fill black, and scale to 512x512
    const scaledMaskCanvas = document.createElement("canvas");
    scaledMaskCanvas.width = 512;
    scaledMaskCanvas.height = 512;
    const smCtx = scaledMaskCanvas.getContext("2d");
    if (!smCtx) return;
    smCtx.fillStyle = "black";
    smCtx.fillRect(0, 0, 512, 512);
    smCtx.drawImage(maskCanvasRef.current, boxX, boxY, finalW, finalH, 0, 0, 512, 512);

    // 4. Send highly contextual 512x512 squares to the worker
    processImage(scaledImgCanvas.toDataURL("image/png"), scaledMaskCanvas.toDataURL("image/png"));
  };

  const handleDownload = () => {
    if (!canvasRef.current || !image) return;
    const link = document.createElement("a");
    link.download = `magic-erased-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL("image/png", 1.0);
    link.click();
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 backdrop-blur-md shadow-2xl">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all shadow-md font-medium"
            disabled={isProcessing}
          >
            <Upload size={18} />
            <span>Upload Image</span>
          </button>

          {image && (
            <div className="flex items-center gap-3 px-4 border-l border-zinc-700 ml-2">
              <label className="text-sm text-zinc-400 font-medium">Brush Size</label>
              <input
                type="range"
                min="5"
                max="100"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-32 accent-purple-500 cursor-pointer"
                disabled={isProcessing}
              />
            </div>
          )}
        </div>

        {image && (
          <div className="flex items-center gap-3">
            <button
              onClick={clearMask}
              className="flex items-center gap-2 px-4 py-2.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-all font-medium"
              disabled={isProcessing}
            >
              <Undo size={18} />
              <span>Clear Mask</span>
            </button>
            <button
              onClick={handleErase}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Eraser size={18} />}
              <span>{isProcessing ? "Processing..." : "Magic Erase"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all shadow-md font-medium border border-zinc-700 ml-2"
              disabled={isProcessing}
            >
              <Download size={18} />
              <span>Download</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Canvas Area */}
      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-opacity-20"
      >
        {!image ? (
          <div className="flex flex-col items-center text-zinc-500 animate-pulse">
            <Upload size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">Upload an image to get started</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`cursor-crosshair max-w-full max-h-full object-contain touch-none ${isProcessing ? 'opacity-50 blur-sm transition-all duration-300' : ''}`}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10 transition-all">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
            <span className="text-white font-medium text-lg drop-shadow-md">Eradicating object...</span>
          </div>
        )}
      </div>
    </div>
  );
}
