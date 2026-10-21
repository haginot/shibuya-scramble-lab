// Retain every elapsed second, while limiting work in an individual request.
export class StepQueue{
 constructor(){this.seconds=0;}
 add(delta){this.seconds+=Math.max(0,delta);}
 take(){const seconds=Math.min(.5,this.seconds);this.seconds-=seconds;return seconds;}
}
