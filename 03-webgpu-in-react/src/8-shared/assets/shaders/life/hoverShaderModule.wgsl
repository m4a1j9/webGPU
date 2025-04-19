struct VertexInput {
  @location(0) pos: vec2f,
}

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) localPos: vec2f,
}

struct HoverUniforms {
  mousePos: vec2f,
  squareSize: vec2f,
  gridSize: vec2f,
}

@group(0) @binding(0)
var<uniform> hoverUniforms: HoverUniforms;

const borderThickness = 0.1;
const clipSpaceSize = 2.0;
const halfClipSpace = clipSpaceSize / 2;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let gridCellSize = clipSpaceSize / hoverUniforms.gridSize;
  let gridAlignedPos = floor(hoverUniforms.mousePos / gridCellSize) * gridCellSize;
  
  output.localPos = input.pos;
  output.pos = vec4f((input.pos + halfClipSpace) * hoverUniforms.squareSize + gridAlignedPos, 0, 1);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.localPos * 0.5 + vec2f(0.5);

  let isBorderX = uv.x < borderThickness || uv.x > (halfClipSpace - borderThickness);
  let isBorderY = uv.y < borderThickness || uv.y > (halfClipSpace - borderThickness);

  if (!isBorderX && !isBorderY) {
    discard;
  }

  return vec4f(1, 1, 1, 1);
}