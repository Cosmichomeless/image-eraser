import ImageCanvas from "@/components/ImageCanvas";
import { Sparkles, Info } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-emerald-900/10 blur-[100px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12 flex flex-col items-center">
        {/* Header */}
        <header className="text-center mb-12 flex flex-col items-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-sm self-center">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-zinc-300">100% Client-Side Magic Eraser</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6">
            Erase anything with <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-blue-500">
              zero latency.
            </span>
          </h1>

          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed">
            Upload an image, brush over the object you want to remove, and watch it vanish.
            All processing happens privately on your device using WebGL/WebGPU. No servers, zero cost.
          </p>
        </header>

        {/* Main App Canvas */}
        <div className="w-full flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <ImageCanvas />
        </div>

        {/* Footer */}
        <footer className="mt-20 text-center text-sm text-zinc-600">
          <p>Powered by Next.js, Tailwind CSS, & onnxruntime-web.</p>
        </footer>
      </div>
    </main>
  );
}
