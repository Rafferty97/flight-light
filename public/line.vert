attribute vec4 aVertexPosition;
uniform mat4 uView;

void main() {
    gl_Position = uView * aVertexPosition;
    gl_Position.y *= 2.0;
}