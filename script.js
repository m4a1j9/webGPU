async function initWebGPU() {
    const canvas = document.querySelector("canvas");

    if (!canvas) {
        throw new Error("Canvas element not found.");
    }

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        const device = await adapter.requestDevice();

        // Configure the canvas for WebGPU
        const context = canvas.getContext("webgpu");
        if (!context) {
            throw new Error("WebGPU context not available.");
        }

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: canvasFormat,
        });

        return { device, canvas, context, canvasFormat };
    } catch (error) {
        console.error("Error initializing WebGPU:", error);
        throw error;
    }
}

initWebGPU()
    .then(program)
    .catch(error => {
        console.error("Failed to initialize WebGPU:", error);
    });

function program(args) {
    const { device, canvas, context, canvasFormat } = args;

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
        }]
    });
    pass.end();

    device.queue.submit([encoder.finish()]);
}