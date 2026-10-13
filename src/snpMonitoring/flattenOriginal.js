import {PDFName,PDFDict,pushGraphicsState,popGraphicsState,concatTransformationMatrix,drawObject} from 'pdf-lib';
const fieldName=w=>{const names=[];while(w){const t=w.get(PDFName.of('T'));if(t)names.unshift(t.decodeText());w=w.lookup(PDFName.of('Parent'));}return names.join('.');};
// Preserve original widget appearances without the source PDFs' shared-field flattening defects.
export function flattenOriginal(pdf,skipFields=new Set()){
 for(const page of pdf.getPages()){
  const annotations=page.node.Annots();
  for(let i=0;annotations&&i<annotations.size();i++){
   const widget=annotations.lookup(i);if(widget.get(PDFName.of('Subtype'))?.toString()!=='/Widget')continue;
   if(skipFields.has(fieldName(widget)))continue;
   const ap=widget.lookup(PDFName.of('AP'));const normal=ap?.lookup(PDFName.of('N'));
   const ref=normal instanceof PDFDict?normal.get(PDFName.of('Off')):ap?.get(PDFName.of('N'));
   if(!ref)continue;const stream=pdf.context.lookup(ref);if(!stream?.dict)continue;
   stream.dict.set(PDFName.of('Type'),PDFName.of('XObject'));stream.dict.set(PDFName.of('Subtype'),PDFName.of('Form'));
   const b=stream.dict.lookup(PDFName.of('BBox')).asArray().map(n=>n.asNumber()),r=widget.lookup(PDFName.of('Rect')).asArray().map(n=>n.asNumber());
   const sx=(r[2]-r[0])/(b[2]-b[0]),sy=(r[3]-r[1])/(b[3]-b[1]);
   const name=page.node.newXObject('OriginalWidget',ref);
   page.pushOperators(pushGraphicsState(),concatTransformationMatrix(sx,0,0,sy,r[0]-b[0]*sx,r[1]-b[1]*sy),drawObject(name),popGraphicsState());
  }
  // Keep district notice hyperlinks, but remove all interactive form widgets.
  if(annotations){const links=[];for(let i=0;i<annotations.size();i++)if(annotations.lookup(i).get(PDFName.of('Subtype'))?.toString()==='/Link')links.push(annotations.get(i));if(links.length)page.node.set(PDFName.of('Annots'),pdf.context.obj(links));else page.node.delete(PDFName.of('Annots'));}
 }
 pdf.catalog.delete(PDFName.of('AcroForm'));pdf.catalog.delete(PDFName.of('OpenAction'));pdf.catalog.delete(PDFName.of('AA'));
}
