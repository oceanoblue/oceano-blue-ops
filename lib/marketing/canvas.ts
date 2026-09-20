export const templateSizes={flyer:[2550,3300],square:[1080,1080],story:[1080,1920]} as const;
export function drawMarketing(canvas:HTMLCanvasElement,image:HTMLImageElement,format:keyof typeof templateSizes,content:{label:string;address:string;details:string;name:string;contact:string}) {
 const [w,h]=templateSizes[format];canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
 const pad=w*0.07,photoHeight=h*(format==='square'?0.54:0.57);
 ctx.fillStyle='#f6f3ec';ctx.fillRect(0,0,w,h);
 const scale=Math.max(w/image.naturalWidth,photoHeight/image.naturalHeight),sw=w/scale,sh=photoHeight/scale;
 ctx.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,0,0,w,photoHeight);
 ctx.fillStyle='#153947';ctx.fillRect(pad,pad,w*0.37,w*0.073);ctx.fillStyle='#ffffff';ctx.font=`600 ${w*0.025}px Arial`;ctx.textBaseline='middle';ctx.fillText(content.label.toUpperCase(),pad*1.3,pad+w*0.0365,w*0.32);
 ctx.fillStyle='#153947';ctx.textBaseline='alphabetic';let y=photoHeight+pad*1.25;
 const text=(value:string,size:number,lineHeight:number,maxLines:number,font='Arial')=>{ctx.font=`${size}px ${font}`;for(const line of wrapText(value,w-2*pad,v=>ctx.measureText(v).width,maxLines)){ctx.fillText(line,pad,y,w-2*pad);y+=lineHeight;}};
 // Fixed line budgets keep long headlines and contact details within the template.
 text(content.address,w*(format==='square'?0.048:0.066),w*0.076,2,'Georgia');
 y+=w*0.016;ctx.fillStyle='#52656b';text(content.details,w*0.026,w*0.039,format==='square'?1:3);
 const footerY=h-pad*1.45;ctx.strokeStyle='#bdc8c7';ctx.lineWidth=Math.max(1,w/1000);ctx.beginPath();ctx.moveTo(pad,footerY-w*0.085);ctx.lineTo(w-pad,footerY-w*0.085);ctx.stroke();ctx.fillStyle='#153947';ctx.font=`600 ${w*0.03}px Arial`;ctx.fillText(content.name,pad,footerY-w*0.015,w-2*pad);ctx.fillStyle='#52656b';ctx.font=`${w*0.025}px Arial`;ctx.fillText(content.contact,pad,footerY+w*0.035,w-2*pad);
}

export function wrapText(value:string,width:number,measure:(s:string)=>number,maxLines:number):string[] {
 const lines:string[]=[];let current='';
 for(const word of value.trim().split(/\s+/)) {const next=current?`${current} ${word}`:word;if(current&&measure(next)>width){lines.push(current);current=word;}else current=next;}
 if(current)lines.push(current);
 const result=lines.slice(0,maxLines);
 return result.map((line,index)=>{if(measure(line)<=width&&!(index===maxLines-1&&lines.length>maxLines))return line;while(line&&measure(line+'…')>width)line=line.slice(0,-1);return line.trimEnd()+'…';});
}
