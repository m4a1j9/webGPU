struct VertexInput {
  @location(0) pos: vec2f,
}

struct VertexOutput {
  @builtin(position) pos: vec4f,
}

@group(0) @binding(0)
var<uniform> hoverPos: vec2f;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  output.pos = vec4f(input.pos + (hoverPos / 1000), 0, 1);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(0.5, 0.5, 0.5, 1);
}