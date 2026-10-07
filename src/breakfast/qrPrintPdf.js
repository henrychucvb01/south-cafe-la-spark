import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import QRCode from 'qrcode';
export const qrPrintDefaults={orientation:'portrait',perPage:4,layout:'vertical',order:'qr,room,campus',showCampus:true,qrSize:144,fontSize:32,campusSize:18,qrRotation:0,textRotation:0};
export function qrPageSize(options){return options.orientation==='landscape'?[792,612]:[612,792];}
export function qrLabelBoxes(options,index){
 const [width,height]=qrPageSize(options),n=Number(options.perPage),cols=n===1?1:2,rows=Math.ceil(n/cols),w=(width-48)/cols,h=(height-48)/rows;
 return {x:24+(index%cols)*w,y:height-24-(Math.floor(index/cols)+1)*h,width:w,height:h};
}
export async function buildQrPrintPdf(records,options=qrPrintDefaults){
 if(!records.length)throw new Error('Select at least one classroom.');
 const o={...qrPrintDefaults,...options};
 if(![1,2,4,6].includes(Number(o.perPage)))throw new Error('Choose a supported page layout.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page;
 for(let i=0;i<records.length;i++){
  if(i%o.perPage===0)page=pdf.addPage(qrPageSize(o));
  const record=records[i];if(!record.url)throw new Error('A classroom QR is missing. Refresh and try again.');
  const box=qrLabelBoxes(o,i%o.perPage),horizontal=o.layout==='horizontal';
  const items=o.order.split(',').filter(k=>k!=='campus'||(o.showCampus&&record.campus_label?.trim()));
  const weights=items.map(k=>k==='qr'?2:1),sum=weights.reduce((a,b)=>a+b,0);let offset=0;
  for(let j=0;j<items.length;j++){
   const k=items[j],fraction=weights[j]/sum;
   const b=horizontal?{x:box.x+offset,y:box.y,width:box.width*fraction,height:box.height}:{x:box.x,y:box.y+box.height-offset-box.height*fraction,width:box.width,height:box.height*fraction};
   offset+=(horizontal?box.width:box.height)*fraction;
   const cx=b.x+b.width/2,cy=b.y+b.height/2;
   if(k==='qr'){
    const size=Math.min(Number(o.qrSize),b.width-16,b.height-16);
    if(size<72)throw new Error('This layout makes the QR too small. Choose fewer labels per page or a different layout.');
    const code=QRCode.create(record.url,{errorCorrectionLevel:'M'}),count=code.modules.size,unit=size/(count+8),angle=Number(o.qrRotation);
    for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.modules.get(r,c)){
     let x=(c+4)*unit-size/2,y=size/2-(r+5)*unit;
     if(angle===90)[x,y]=[-y-unit,x];else if(angle===180)[x,y]=[-x-unit,-y-unit];else if(angle===270)[x,y]=[y,-x-unit];
     page.drawRectangle({x:cx+x,y:cy+y,width:unit,height:unit,color:rgb(0,0,0)});
    }
   }else{
    const text=String(k==='room'?record.room_code:record.campus_label).trim(),angle=Number(o.textRotation),sideways=angle===90||angle===270;
    const availableWidth=(sideways?b.height:b.width)-16,availableHeight=(sideways?b.width:b.height)-16;
    let size;try{size=Math.min(Number(k==='room'?o.fontSize:o.campusSize),availableWidth/Math.max(font.widthOfTextAtSize(text,1),1),availableHeight/1.2);}catch{throw new Error('This room or campus contains characters the print font cannot display. Update the label before printing.');}
    if(size<8)throw new Error('The room or campus name does not fit. Choose fewer labels per page or another layout.');
    const w=font.widthOfTextAtSize(text,size),h=font.heightAtSize(size,{descender:false});let x=-w/2,y=-h/2;
    if(angle===90)[x,y]=[-y,x];else if(angle===180)[x,y]=[-x,-y];else if(angle===270)[x,y]=[y,-x];
    page.drawText(text,{x:cx+x,y:cy+y,size,font,rotate:degrees(angle),color:rgb(0,0,0)});
   }
  }
 }
 pdf.setTitle('Breakfast classroom QR labels');return pdf.save();
}
