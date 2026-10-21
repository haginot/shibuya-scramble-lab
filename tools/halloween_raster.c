// Original compact perspective-correct CPU triangle rasterizer. MIT, HAGINO 2026.
#include <math.h>
#include <stdint.h>
static float clamp(float x,float lo,float hi){return fminf(hi,fmaxf(lo,x));}
static float tone(float x){x=fmaxf(0.f,x*1.25f);float a=(x*(2.51f*x+.03f))/(x*(2.43f*x+.59f)+.14f);return powf(clamp(a,0.f,1.f),1.f/2.2f)*255.f;}
static float env_day=0,env_dusk=0,env_aerial=0;
// Per-frame light/sky state shared by the exported scene and socket-free capture.
void environment(float day,float dusk,float aerial){env_day=day;env_dusk=dusk;env_aerial=aerial;}
void triangles(uint8_t*out,float*depth,int w,int h,const float*s,const float*a,int n,const uint8_t*tex,int tw,int th,int textureKind,float er,float eg,float eb,float opacity,int depthWrite){
 const float emission[3]={er,eg,eb},fog[3]={41*(1-env_day)+160*env_day+30*env_dusk,33*(1-env_day)+186*env_day+10*env_dusk,62*(1-env_day)+207*env_day};
 for(int k=0;k+2<n;k+=3){const float*p=s+k*3,*v=a+k*6;float x0=p[0],y0=p[1],x1=p[3],y1=p[4],x2=p[6],y2=p[7];if(p[2]<=0||p[5]<=0||p[8]<=0)continue;float area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(fabsf(area)<.02f)continue;int lx=fmaxf(0,(int)floorf(fminf(x0,fminf(x1,x2)))),hx=fminf(w-1,(int)ceilf(fmaxf(x0,fmaxf(x1,x2)))),ly=fmaxf(0,(int)floorf(fminf(y0,fminf(y1,y2)))),hy=fminf(h-1,(int)ceilf(fmaxf(y0,fmaxf(y1,y2))));if(lx>hx||ly>hy)continue;
  for(int y=ly;y<=hy;y++)for(int x=lx;x<=hx;x++){float px=x+.5f,py=y+.5f,b1=((px-x0)*(y2-y0)-(py-y0)*(x2-x0))/area,b2=((x1-x0)*(py-y0)-(y1-y0)*(px-x0))/area,b0=1-b1-b2;if(b0<0||b1<0||b2<0)continue;float inv=b0*p[2]+b1*p[5]+b2*p[8],z=1.f/inv;int i=y*w+x;if(z>depth[i]+.001f)continue;float q0=b0*p[2]*z,q1=b1*p[5]*z,q2=b2*p[8]*z,alpha=opacity,tx[4]={1,1,1,1};
   if(textureKind){float u=q0*v[3]+q1*v[9]+q2*v[15],t=q0*v[4]+q1*v[10]+q2*v[16];if(textureKind==2){u-=floorf(u);t-=floorf(t);}else{u=clamp(u,0.f,.99999f);t=clamp(t,0.f,.99999f);}int ix=clamp((int)(u*tw),0,tw-1),iy=clamp((int)((1-t)*th),0,th-1),j=(iy*tw+ix)*4;for(int c=0;c<4;c++)tx[c]=tex[j+c]/255.f;if(textureKind==1)alpha*=tx[3];}
   if(alpha<.03f)continue;float dist=q0*v[5]+q1*v[11]+q2*v[17],f=clamp(1.f-expf(-dist*dist*(env_aerial>.5f?.000000003f:.000000012f)),0.f,env_aerial>.5f?.45f:.85f);
   for(int c=0;c<3;c++){float base=q0*v[c]+q1*v[6+c]+q2*v[12+c];if(textureKind==1)base*=tx[c]*tx[c];base+=emission[c]*(textureKind==2?tx[c]*tx[c]:1.f);float rgb=tone(base)*(1-f)+fog[c]*f;out[i*3+c]=(uint8_t)clamp(rgb*alpha+out[i*3+c]*(1-alpha),0.f,255.f);}if(depthWrite&&alpha>.5f)depth[i]=z;
  }
 }
}
void points(uint8_t*out,float*depth,int w,int h,const float*s,const float*colors,int n,float size,const uint8_t*tex,int tw,int th,float opacity){
 for(int k=0;k<n;k++){const float*p=s+k*3;if(p[2]<=0)continue;float z=1.f/p[2],side=fmaxf(1.f,size*p[2]),left=p[0]-side/2,top=p[1]-side/2;int lx=fmaxf(0,(int)left),hx=fminf(w-1,(int)(left+side)),ly=fmaxf(0,(int)top),hy=fminf(h-1,(int)(top+side));for(int y=ly;y<=hy;y++)for(int x=lx;x<=hx;x++){int i=y*w+x;if(z>depth[i]+1)continue;float a=opacity;if(tex){int tx=clamp((int)((x-left)/side*tw),0,tw-1),ty=clamp((int)((y-top)/side*th),0,th-1);a*=tex[(ty*tw+tx)*4+3]/255.f;}if(a<.2f)continue;for(int c=0;c<3;c++){float rgb=tone(colors[k*3+c]);out[i*3+c]=(uint8_t)(rgb*a+out[i*3+c]*(1-a));}depth[i]=z;}}
}
extern void lines(uint8_t*out,float*depth,int w,int h,const float*s,int n,float r,float g,float b){
 const float rgb[3]={tone(r),tone(g),tone(b)};
 for(int k=1;k<n;k++){const float*a=s+(k-1)*3,*c=s+k*3;if(a[2]<=0||c[2]<=0)continue;float length=fmaxf(fabsf(c[0]-a[0]),fabsf(c[1]-a[1]));int steps=(int)ceilf(length);for(int j=0;j<=steps;j++){if((j/5)%2)continue;float t=steps?(float)j/steps:0,inv=a[2]*(1-t)+c[2]*t;int x=(int)(a[0]+(c[0]-a[0])*t),y=(int)(a[1]+(c[1]-a[1])*t);if(x<0||y<0||x>=w||y>=h)continue;int p=y*w+x;if(1.f/inv>depth[p]+.7f)continue;for(int channel=0;channel<3;channel++)out[p*3+channel]=(uint8_t)rgb[channel];}}
}
