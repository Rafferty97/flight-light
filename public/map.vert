attribute vec4 aVertexPosition;
uniform float uRotate;
varying vec2 vTextureCoord;

void main() {
    gl_Position = aVertexPosition;
    vTextureCoord = (aVertexPosition.xy * vec2(0.5, -0.5)) + vec2(0.5 + uRotate, 0.5);
}