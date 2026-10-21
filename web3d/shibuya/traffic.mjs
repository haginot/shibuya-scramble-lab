// The renderer and safety checks share the exact same vehicle interpolation.
export function vehiclePoses(traffic,clock){
 const t=((clock%150)+150)%150,poses=[];
 for(const track of traffic.tracks){
  const frames=track.frames;if(t<frames[0][0]||t>frames.at(-1)[0])continue;
  let lo=0,hi=frames.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(frames[m][0]<=t)lo=m;else hi=m;}
  const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(t-a[0])/Math.max(.01,b[0]-a[0])));
  poses.push({id:track.id,x:a[1]+(b[1]-a[1])*u,z:a[2]+(b[2]-a[2])*u,angle:Math.atan2(b[1]-a[1],b[2]-a[2])||a[3]*Math.PI/180});
 }
 return poses;
}
