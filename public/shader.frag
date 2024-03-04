precision mediump float;
varying vec2 vTextureCoord;
uniform vec2 uSun;
uniform vec2 uPointer;
uniform sampler2D uSampler;

const float PI = 3.1415926535897932384626433832795;
const float DEG = 0.01745329251;

float hav(float theta) {
    return 0.5 * (1.0 - cos(theta));
}

float calcAngle(vec2 coord1, vec2 coord2) {
    float lat1 = coord1.y;
    float lon1 = coord1.x;
    float lat2 = coord2.y;
    float lon2 = coord2.x;

    float havTheta = hav(lat1 - lat2) + cos(lat1) * cos(lat2) * hav(lon1 - lon2);
    return 2.0 * asin(sqrt(clamp(havTheta, 0.0, 1.0)));
}

float calcLight(vec2 coord1, vec2 coord2, float minLight) {
    float start = PI / 2.0; // Start of twilight
    float duration = 0.31415926535; // Duration of twilight
    float theta = calcAngle(coord1, coord2);
    return 1.0 - (1.0 - minLight) * clamp((theta - start) / duration, 0.0, 1.0);
}

vec3 toCartesian(vec2 coord) {
    float lat = coord.y;
    float lon = coord.x;
    return vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
}

float lineDist(vec2 probe, vec2 coord1, vec2 coord2) {
    vec3 p = toCartesian(probe);
    vec3 a = toCartesian(coord1);
    vec3 b = toCartesian(coord2);
    vec3 n = normalize(cross(a, b));
    if (dot(p, cross(n, a)) > 0.0 && dot(p, cross(n, b)) < 0.0) {
        return asin(abs(dot(p, n)));
    } else {
        return min(acos(clamp(dot(p, a), 0.0, 1.0)), acos(clamp(dot(p, b), 0.0, 1.0)));
    }
}

vec2 nearLine(vec2 probe, vec2 coord1, vec2 coord2) {
    vec3 p = toCartesian(probe);
    vec3 a = toCartesian(coord1);
    vec3 b = toCartesian(coord2);
    vec3 n = normalize(cross(a, b));

    float x = dot(p, a);
    float y = dot(p, cross(n, a));
    return vec2(x, y) * 0.5 + 0.5;
}

void main() {
    gl_FragColor = 0.9 * texture2D(uSampler, vTextureCoord) + 0.2;

    vec2 coord = (vTextureCoord - vec2(0.5, 0.5)) * vec2(2.0 * PI, -PI);
    vec2 sun = uSun;

    float angle = (180.0 / PI) * calcAngle(coord, uSun);

    if (angle > 108.0) {
        gl_FragColor *= 0.25;
    } else if (angle > 102.0) {
        gl_FragColor *= 0.5;
    } else if (angle > 96.0) {
        gl_FragColor *= 0.75;
    } else if (angle > 90.0) {
        gl_FragColor *= 1.0;
    } else {
        gl_FragColor *= 1.25;
    }

    if (angle < 2.0) {
        gl_FragColor += vec4(1.0, 0.9, 0.5, 0.0);
    }
    
    if ((180.0 / PI) * calcAngle(coord, uPointer) < 2.0) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }

    if (lineDist(coord, uSun, uPointer) < 0.01) {
        gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
    }
    gl_FragColor = vec4(nearLine(coord, uSun, uPointer), 0.0, 1.0);

    // if (coord.y > 20.0 * (calcSun(365.24 * vTextureCoord.x, 1.0).x - calcSun(365.24 * vTextureCoord.x, 0.0).x)) {
    //     gl_FragColor.x = 1.0;
    // } else {
    //     gl_FragColor.x = 0.0;
    // }
    // if (coord.y > 0.0) {
    //     gl_FragColor.y = 1.0;
    // } else {
    //     gl_FragColor.y = 0.0;
    // }
}

// void main() {
//     // Normalized pixel coordinates (from 0 to 1)
//     vec2 normCoord = gl_FragCoord.xy / vec2(100.0, 100.0);
    
//     // Create a pseudo-random color
//     float red = fract(sin(dot(normCoord, vec2(12.9898, 78.233))) * 43758.5453);
//     float green = fract(sin(dot(normCoord, vec2(43.2321, 54.2356))) * 12345.6789);
//     float blue = fract(sin(dot(normCoord, vec2(29.0, 31.0))) * 54321.1234);

//     gl_FragColor = vec4(red, green, blue, 1.0);
// }

vec2 calcSun(float n) {
    // Mean longitude and mean anomoly
    float L = (280.460 + 0.9856474 * n) * DEG;
    float g = (357.528 + 0.9856003 * n) * DEG;

    // Ecliptic longitude
    float lambda = L + (1.915 * sin(g) + 0.020 * sin(2.0 * g)) * DEG;

    // Obliquity of the eliptic
    float eta = (23.439 - 0.0000004 * n) * DEG;

    // Equatorial coordinates
    float alpha = atan(cos(eta) * sin(lambda), cos(lambda));
    float sigma = asin(sin(eta) * sin(lambda));

    // Greenwhich hour angle
    float gha = PI - 2.0 * PI * fract(n) + (alpha - L);
    
    return vec2(gha, sigma);
}