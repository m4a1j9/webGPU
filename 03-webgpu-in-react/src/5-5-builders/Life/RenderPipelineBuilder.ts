export class RenderPipelineBuilder {
  device: GPUDevice;
  bindGroupLayouts: GPUBindGroupLayout[] = [];
  buffers: GPUVertexBufferLayout[] = [];
  renderTargets: GPUColorTargetState[] = [];

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async addBindGroupLayout(layout: GPUBindGroupLayout) {
    this.bindGroupLayouts.push(layout);
  }

  addVertexBufferDescription(vertexBufferLayout: GPUVertexBufferLayout) {
    this.buffers.push(vertexBufferLayout);
  }

  addRenderTarget(format: GPUTextureFormat, blend?: GPUBlendState) {
    const target: GPUColorTargetState = {
      format,
      blend,
    };

    this.renderTargets.push(target);
  }

  async build(layoutLabel: string, pipelineLabel: string, shaderModule: GPUShaderModule) {
    const pipelineLayout = this.device.createPipelineLayout({
      label: layoutLabel,
      bindGroupLayouts: this.bindGroupLayouts,
    });

    const cellPipeline = this.device.createRenderPipeline({
      label: pipelineLabel,
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: this.buffers,
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: this.renderTargets,
      },
    });

    this.reset();

    return cellPipeline;
  }

  reset() {
    this.bindGroupLayouts = [];
    this.buffers = [];
    this.renderTargets = [];
  }
}
