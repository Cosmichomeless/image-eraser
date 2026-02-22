# 🪄 Magic Eraser

A 100% Client-Side, fully private AI object removal app built with Next.js, Tailwind CSS, and ONNX Runtime Web. 

Erase unwanted objects from your photos flawlessly—**directly in your browser**.

---

## 🚀 Features

- **100% Client-Side Processing**: No servers, no APIs, zero cost. Everything runs natively on your machine using WebAssembly and WebGPU.
- **Privacy First**: Your photos never leave your device.
- **High-Definition Inpainting**: Crops to your exact mask to preserve original 4K/HD image resolutions instead of shrinking the entire photo.
- **Sequential Erasing**: Erase as many times as you want on the same image without resetting.
- **Beautiful UI**: Modern, glassmorphic design built with Tailwind CSS and Next.js App Router.
- **Hardware Accelerated**: Uses `onnxruntime-web` to tap directly into your machine's WebAssembly limits for near-instant offline AI.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Machine Learning**: ONNX Runtime Web (`onnxruntime-web`)
- **Model**: LaMa (Large Mask Inpainting) FP32
- **Icons**: Lucide React

---

## 📦 Getting Started

### 1. Requirements
Ensure you have Node.js (v18+) installed.

### 2. Installation
Clone the repository and install the dependencies:

```bash
git clone https://github.com/your-username/magic-eraser.git
cd magic-eraser
npm install
```

### 3. Download the AI Model
This app requires the ONNX LaMa model to run the magic eraser logic.

1. Download the `lama_fp32.onnx` model (you can find quantized LaMa ONNX models on Hugging Face or similar ML model hubs).
2. Place the downloaded file inside the `public/models/` directory of this project:

```text
magic-eraser/
├── public/
│   └── models/
│       └── lama_fp32.onnx   <-- Place it here!
```

### 4. Run the Development Server

Start the local server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 🎨 How to Use

1. **Upload an Image**: Click the "Upload Image" button or drag and drop your photo into the canvas.
2. **Brush**: Adjust the brush size using the slider.
3. **Paint**: Paint over the object, person, or text you want to vanish.
4. **Erase**: Click the **Magic Erase** button and watch it disappear.
5. **Download**: Click the **Download** button to save the seamlessly edited high-resolution photo.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/your-username/magic-eraser/issues).

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

*Powered by Next.js, Tailwind CSS & onnxruntime-web.*
