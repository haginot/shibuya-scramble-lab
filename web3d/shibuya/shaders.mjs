// Shared GLSL chunks and the uniform objects every custom material references.
// Lighting is a night model: sky ambient + a baked top-down "street light field"
// (shopfronts, lamps, screens) + emissive sources, finished by HDR bloom.
import * as THREE from '../vendor/three.module.min.js';

export const shared={
 uTime:{value:0},
 uDaylight:{value:0},
 uLightmap:{value:null},
 uLightRect:{value:new THREE.Vector4(-450,-450,900,900)},
 uTrail:{value:null},
 uTrailRect:{value:new THREE.Vector4(-130,-130,260,260)},
 uTrailGain:{value:0},
 uFogColor:{value:new THREE.Color(0x1a1530)},
 uFogDensity:{value:.0021},
 uSkyTop:{value:new THREE.Color(0x02040c)},
 uSkyHorizon:{value:new THREE.Color(0x2a1838)},
 uSunDir:{value:new THREE.Vector3(-.4,.8,.3).normalize()},
 uWet:{value:.85},
 uScreenGlow:{value:new THREE.Color(0x4060ff)},
 uFacade:{value:0},// 0 = classic facades; 1 = dimmer, varied windows with blinds and floor bands (Halloween look)
};

export const common=/* glsl */`
uniform float uTime,uDaylight,uFogDensity,uTrailGain,uWet,uFacade;
uniform sampler2D uLightmap,uTrail;
uniform vec4 uLightRect,uTrailRect;
uniform vec3 uFogColor,uSkyTop,uSkyHorizon,uSunDir,uScreenGlow;
float hash11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise2(p);p=p*2.03+17.1;a*=.5;}return v;}
// Street light field at a ground position (linear HDR-ish).
vec3 streetLight(vec2 xz){vec2 uv=(xz-uLightRect.xy)/uLightRect.zw;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return vec3(0);vec3 c=texture2D(uLightmap,uv).rgb;return c*c*1.6*(1.0-.85*uDaylight);}
vec3 trailAt(vec2 xz){vec2 uv=(xz-uTrailRect.xy)/uTrailRect.zw;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return vec3(0);return texture2D(uTrail,uv).rgb;}
vec3 skyColor(vec3 d){float h=clamp(d.y,-.2,1.);vec3 night=mix(uSkyHorizon,uSkyTop,pow(clamp(h,0.,1.),.45));vec3 day=mix(vec3(.78,.84,.9),vec3(.32,.5,.78),pow(clamp(h,0.,1.),.6));return mix(night,day,uDaylight);}
vec3 applyFog(vec3 col,vec3 world,vec3 eye){float dist=length(world-eye);float f=1.-exp(-pow(dist*uFogDensity,1.35));f*=mix(1.,.55,clamp(world.y/180.,0.,1.));return mix(col,uFogColor,clamp(f,0.,1.));}
`;
