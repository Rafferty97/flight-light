precision mediump float;
varying vec2 vTextureCoord;
uniform vec2 uSun;
uniform vec2 uSrc;
uniform vec2 uDst;
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

vec2 fromCartesian(vec3 coord) {
    float lat = asin(coord.z);
    float lon = atan(coord.y, coord.x);
    return vec2(lon, lat);
}

vec2 projectLine(vec2 probe, vec2 coord1, vec2 coord2) {
    vec3 p = toCartesian(probe);
    vec3 a = toCartesian(coord1);
    vec3 b = toCartesian(coord2);
    vec3 n = normalize(cross(a, b));

    if (dot(p, cross(n, a)) < 0.0) {
        return coord1;
    } else if (dot(p, cross(n, b)) > 0.0) {
        return coord2;
    } else {
        return fromCartesian(p - n * dot(p, n));
    }
}

float wrappedDistance2(vec2 a, vec2 b) {
    float x = acos(cos(a.x - b.x));
    float y = acos(cos(a.y - b.y));
    return x * x + y * y;
}

float wrappedDistance(vec2 a, vec2 b) {
    return sqrt(wrappedDistance2(a, b));
}

float lineDist(vec2 probe, vec2 coord1, vec2 coord2) {
    vec3 p = toCartesian(probe);
    vec3 a = toCartesian(coord1);
    vec3 b = toCartesian(coord2);
    vec3 n = normalize(cross(a, b));
    
    // FIXME: Make better - Newton's method?
    // 1. Convert to cartesian
    // vec3 a = toCartesian(coord1);
    // vec3 b = toCartesian(coord2);
    // 2. Define parametric function
    // vec2 c = fromCartesian(normalize(a + t * (b - a)));
    // 3. Iterate

    float dist = 10000.0;
    vec3 k = p - n * dot(p, n);
    float j = dot(k - a, b - a) / dot(b - a, b - a); // FIXME: NOT CORRECT
    for (int i = 0; i < 1; i++) {
        vec2 proj = fromCartesian(normalize(a + j * (b - a)));
        dist = min(dist, wrappedDistance2(probe, proj));

        vec2 proj2 = fromCartesian(normalize(a + (j + 0.01) * (b - a)));
        vec2 delta = proj2 - proj;
        j += 0.01 * (dot(probe - proj, delta) / dot(delta, delta));
        j = clamp(j, 0.0, 1.0);
    }
    return sqrt(dist);
}

bool testPoints(vec2 a, vec2 b, float d) {
    float x = acos(cos(a.x - b.x));
    float y = acos(cos(a.y - b.y));
    return (x * x + y * y) < d * d;
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

    // if (testPoints(coord, projectLine(coord, uSrc, uDst), 0.005)) {
    //     gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
    // }
    gl_FragColor.y += 1.0 - clamp(2.0 * lineDist(coord, uSrc, uDst), 0.0, 1.0);
    if (testPoints(coord, uSrc, 0.02) || testPoints(coord, uDst, 0.02)) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }   

    if (testPoints(coord, uSun, 0.05)) {
        gl_FragColor += vec4(1.0, 0.9, 0.5, 0.0);
    }
}

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