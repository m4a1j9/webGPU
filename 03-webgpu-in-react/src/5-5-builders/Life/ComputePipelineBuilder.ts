export class ComputePipelineBuilder {
  device: GPUDevice;
  bindGroupLayouts: GPUBindGroupLayout[] = [];

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async addBindGroupLayout(layout: GPUBindGroupLayout) {
    this.bindGroupLayouts.push(layout);
  }
  
  async build(layoutLabel: string, pipelineLabel: string, shaderModule: GPUShaderModule) {
    const pipelineLayout = this.device.createPipelineLayout({
      label: layoutLabel,
      bindGroupLayouts: this.bindGroupLayouts,
    });

    const simulationPipeline = this.device.createComputePipeline({
      label: pipelineLabel,
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'computeMain',
      },
    });

    this.reset();

    return simulationPipeline;
  }

  reset() {
    this.bindGroupLayouts = [];
  }
}