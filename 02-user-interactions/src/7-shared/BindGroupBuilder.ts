export class BindGroupBuilder {
  device: GPUDevice;
  bindGroupEntries: GPUBindGroupEntry[] = [];
  binding = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  addEntry(buffer: GPUBuffer) {
    this.bindGroupEntries.push({
      binding: this.binding,
      resource: {
        buffer: buffer,
      },
    });

    this.binding += 1;
  }

  async build(label: string, layout: GPUBindGroupLayout) {
    const bindGroup = await this.device.createBindGroup({
      label,
      layout: layout,
      entries: this.bindGroupEntries,
    });

    this.reset();

    return bindGroup;
  }

  reset() {
    this.bindGroupEntries = [];
    this.binding = 0;
  }
}
