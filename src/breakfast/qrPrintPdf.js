import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import QRCode from 'qrcode';
export const qrPrintDefaults={orientation:'portrait',perPage:4,layout:'vertical',order:'qr,room,campus',showCampus:true,qrSize:144,fontSize:32,campusSize:18,qrRotation:0,textRotation:0,spacing:24,doubleText:false,doubleQr:false};
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
  const gap=Number(o.spacing),sideways=[90,270].includes(Number(o.textRotation));
  const measured=items.map(k=>{
   if(k==='qr'){const size=Number(o.qrSize)*(o.doubleQr?2:1);return {k,size,width:size,height:size};}
   const text=String(k==='room'?record.room_code:record.campus_label).trim(),size=Number(k==='room'?o.fontSize:o.campusSize)*(o.doubleText?2:1);
   let w;try{w=font.widthOfTextAtSize(text,size);}catch{throw new Error('This room or campus contains characters the print font cannot display. Update the label before printing.');}
   const h=font.heightAtSize(size,{descender:true});return {k,text,size,width:sideways?h:w,height:sideways?w:h};
  });
  const total=measured.reduce((n,m)=>n+(horizontal?m.width:m.height),0)+gap*(items.length-1),cross=Math.max(...measured.map(m=>horizontal?m.height:m.width));
  const scale=Math.min(1,(horizontal?box.width-16:box.height-16)/total,(horizontal?box.height-16:box.width-16)/cross);
  let offset=((horizontal?box.width:box.height)-total*scale)/2;
  for(const m of measured){
   const k=m.k,extent=(horizontal?m.width:m.height)*scale;
   const b=horizontal?{x:box.x+offset,y:box.y,width:extent,height:box.height}:{x:box.x,y:box.y+box.height-offset-extent,width:box.width,height:extent};
   offset+=extent+gap*scale;
   const cx=b.x+b.width/2,cy=b.y+b.height/2;
   if(k==='qr'){
    const size=m.size*scale;
    if(size<72)throw new Error('This layout makes the QR too small. Choose fewer labels per page or a different layout.');
    const code=QRCode.create(record.url,{errorCorrectionLevel:'M'}),count=code.modules.size,unit=size/(count+8),angle=Number(o.qrRotation);
    for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.modules.get(r,c)){
     let x=(c+4)*unit-size/2,y=size/2-(r+5)*unit;
     if(angle===90)[x,y]=[-y-unit,x];else if(angle===180)[x,y]=[-x-unit,-y-unit];else if(angle===270)[x,y]=[y,-x-unit];
     page.drawRectangle({x:cx+x,y:cy+y,width:unit,height:unit,color:rgb(0,0,0)});
    }
   }else{
    const text=m.text,angle=Number(o.textRotation),size=m.size*scale;
    if(size<8)throw new Error('The room or campus name does not fit. Choose fewer labels per page or another layout.');
    const w=font.widthOfTextAtSize(text,size),h=font.heightAtSize(size,{descender:false});let x=-w/2,y=-h/2;
    if(angle===90)[x,y]=[-y,x];else if(angle===180)[x,y]=[-x,-y];else if(angle===270)[x,y]=[y,-x];
    page.drawText(text,{x:cx+x,y:cy+y,size,font,rotate:degrees(angle),color:rgb(0,0,0)});
   }
  }
 }
 pdf.setTitle('Breakfast classroom QR labels');return pdf.save();
}
