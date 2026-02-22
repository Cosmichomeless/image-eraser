import { useState, useEffect, useRef, useCallback } from 'react';

export function useInference() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Initialize Web Worker
        workerRef.current = new Worker(new URL('../lib/inferenceWorker.ts', import.meta.url), {
            type: 'module',
        });

        workerRef.current.onmessage = (event) => {
            const { type, payload, error } = event.data;
            if (type === 'result') {
                setResultImage(payload);
                setIsProcessing(false);
            } else if (type === 'error') {
                setError(error);
                setIsProcessing(false);
            } else if (type === 'init-done') {
                console.log('Worker initialized successfully.');
            }
        };

        workerRef.current.onerror = (err) => {
            console.error('Worker error:', err);
            setError('A fatal error occurred in the Web Worker.');
            setIsProcessing(false);
        };

        // Pre-load the model
        workerRef.current.postMessage({ type: 'init' });

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const processImage = useCallback((imageSrc: string, maskSrc: string) => {
        if (!workerRef.current) return;
        setIsProcessing(true);
        setError(null);
        setResultImage(null);
        workerRef.current.postMessage({
            type: 'process',
            payload: { imageSrc, maskSrc },
        });
    }, []);

    return { processImage, isProcessing, resultImage, error };
}
