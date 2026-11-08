export function mapGesturePointer(detail,sensitivity=1.5){
  const clamp=n=>Math.max(0,Math.min(1,n));
  return {...detail,x:clamp(.5+(detail.x-.5)*sensitivity),y:clamp(.5+(detail.y-.5)*sensitivity),z:clamp(Number.isFinite(detail.z)?detail.z:.5),source:'webcam'};
}

export function heightFromHandScale(scale){
  return Math.max(0,Math.min(1,.5+1.15*(1/Math.max(.1,scale)-1)));
}
