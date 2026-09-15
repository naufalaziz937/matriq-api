const zlib = require('zlib');
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
const display = value => value == null ? '' : value instanceof Date ? value.toISOString().replace('T',' ').slice(0,19) : typeof value === 'object' ? JSON.stringify(value) : String(value);
const safe = value => /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
function csv(columns, rows) {
  const cell = value => `"${safe(display(value)).replace(/"/g,'""')}"`;
  return '\ufeff' + [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
}
function crc32(buffer) { let crc=~0; for (const byte of buffer) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^(-(crc&1)&0xedb88320); } return (~crc)>>>0; }
function zip(files) {
  const locals=[], centrals=[]; let offset=0;
  for(const [name,content] of Object.entries(files)) {
    const file=Buffer.from(content), filename=Buffer.from(name), compressed=zlib.deflateRawSync(file), crc=crc32(file);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(8,6); local.writeUInt16LE(8,8); local.writeUInt32LE(crc,14); local.writeUInt32LE(compressed.length,18); local.writeUInt32LE(file.length,22); local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,compressed);
    const central=Buffer.alloc(46); central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(8,8); central.writeUInt16LE(8,10); central.writeUInt32LE(crc,16); central.writeUInt32LE(compressed.length,20); central.writeUInt32LE(file.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42);
    centrals.push(central,filename); offset+=local.length+filename.length+compressed.length;
  }
  const centralBuffer=Buffer.concat(centrals), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(Object.keys(files).length,8); end.writeUInt16LE(Object.keys(files).length,10); end.writeUInt32LE(centralBuffer.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBuffer,end]);
}
function xlsx(columns,rows) {
  const letter=n=>{ let s=''; for(n++;n;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; };
  const cell=(value,r,c,header=false)=>{ const ref=`${letter(c)}${r}`; if (!header && typeof value==='number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`; const content=safe(display(value)); return `<c r="${ref}" t="inlineStr"${header?' s="1"':''}><is><t xml:space="preserve">${xml(content)}</t></is></c>`; };
  const widths=columns.map(key=>Math.min(45,Math.max(14,key.length+2,...rows.slice(0,100).map(row=>Math.min(45,display(row[key]).length+2)))));
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1">${columns.map((v,c)=>cell(v,1,c,true)).join('')}</row>${rows.map((row,i)=>`<row r="${i+2}">${columns.map((key,c)=>cell(row[key],i+2,c)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zip({
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':sheet,
  });
}
module.exports={csv,xlsx};
