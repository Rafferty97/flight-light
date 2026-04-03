attribute vec4 aVertexPosition;
uniform mat4 uView;
varying vec2 vTextureCoord;

void main() {
    gl_Position = uView * aVertexPosition;
    gl_Position.y *= 2.0;
    vTextureCoord = aVertexPosition.xy;
}
