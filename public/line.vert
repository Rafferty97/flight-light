attribute vec4 aVertexPosition;
uniform float uOffset;

void main() {
    gl_Position = aVertexPosition + vec4(2.0 * uOffset, 0, 0, 0);
}