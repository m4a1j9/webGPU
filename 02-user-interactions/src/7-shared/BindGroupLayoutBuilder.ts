export class BindGroupLayoutBuilder {
  device: GPUDevice;
  bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [];
  binding = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  addLayoutEntry(visibility: number, type?: GPUBufferBindingType) {
    this.bindGroupLayoutEntries.push({
      binding: this.binding,
      visibility: visibility,
      buffer: {
        type: type,
      },
    });

    this.binding += 1;
  }

  async build(label: string): Promise<GPUBindGroupLayout> {
    const layout: GPUBindGroupLayout = await this.device.createBindGroupLayout({
      label: label,
      entries: this.bindGroupLayoutEntries,
    });

    this.reset();

    return layout;
  }

  reset() {
    this.bindGroupLayoutEntries = [];
    this.binding = 0;
  }
}
