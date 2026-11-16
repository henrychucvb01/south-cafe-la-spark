export function photoFilename(photo){const clean=value=>String(value).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-');return clean(`${photo.date||'photo'}_${photo.school}_${photo.contest}`).slice(0,110)+'_'+clean(photo.id).slice(-36)+'.webp';}
const encoder=new TextEncoder();
function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
// Standard uncompressed ZIP; photos are already WebP-compressed. No paid service.
export function photoZip(files){
 const parts=[],central=[];let offset=0,centralSize=0;
 for(const file of files){
  const name=encoder.encode(file.name),bytes=new Uint8Array(file.bytes),crc=crc32(bytes),local=header(30),dir=header(46);
  local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(12,33,true);local.view.setUint32(14,crc,true);local.view.setUint32(18,bytes.length,true);local.view.setUint32(22,bytes.length,true);local.view.setUint16(26,name.length,true);
  dir.view.setUint32(0,0x02014b50,true);dir.view.setUint16(4,20,true);dir.view.setUint16(6,20,true);dir.view.setUint16(14,33,true);dir.view.setUint32(16,crc,true);dir.view.setUint32(20,bytes.length,true);dir.view.setUint32(24,bytes.length,true);dir.view.setUint16(28,name.length,true);dir.view.setUint32(42,offset,true);
  parts.push(local.bytes,name,bytes);central.push(dir.bytes,name);offset+=30+name.length+bytes.length;centralSize+=46+name.length;
 }
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
 return new Blob([...parts,...central,end.bytes],{type:'application/zip'});
}
export function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
