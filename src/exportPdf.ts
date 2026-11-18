import { jsPDF } from 'jspdf'
import { categoryGroups, matchName, quantity, score } from './exportFormats'
import type { ExportDataset } from './exportFormats'
import type { AtlasRow } from './dataset'

// The standard Helvetica font uses WinAnsi. Keep accents and common marks;
// make unsupported characters explicit in the print edition, never in CSV/TXT.
const punctuation = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
function printable(s: string) {
  return Array.from(s.normalize('NFC').replace(/\s+/g, ' ').trim()).map(c => {
    const n = c.codePointAt(0)!
    return n >= 32 && n <= 126 || n >= 160 && n <= 255 || punctuation.includes(c)
      ? c : `[U+${n.toString(16).toUpperCase().padStart(4,'0')}]`
  }).join('')
}

export function printablePdf({ rows, bundled }: ExportDataset): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true })
  doc.setProperties({ title: 'Block Atlas — Minecraft to Bloxd.io', author: 'Block Atlas', subject: 'Printable block comparison reference' })
  doc.setLanguage('en')
  doc.setDisplayMode('fullwidth','continuous','UseOutlines')
  const groups = categoryGroups(rows)
  const scored = rows.reduce((n,r) => n+Number(r.delta!==null), 0)
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const M = 38, width = W-M*2, bottom = H-50
  const ink = '#172432', muted = '#4B5F70', line = '#DAE2E9', blue = '#174977', tint = '#EDF4FA'
  type Type = 'regular' | 'bold' | 'mono'
  function font(size: number, type: Type, color = ink) {
    doc.setFont(type==='mono' ? 'courier' : 'helvetica', type==='bold' ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color)
  }
  function text(s: string|string[], x: number, y: number, size = 10, type: Type = 'regular', color = ink, align: 'left'|'right' = 'left') {
    font(size,type,color)
    doc.text(s,x,y,{ align, lineHeightFactor: 1.25 })
  }
  function wrapped(s: string, max: number, size = 10, type: Type = 'regular', limit = 5): string[] {
    font(size,type)
    const parts: string[] = doc.splitTextToSize(printable(s.slice(0,1800)),max)
    if (parts.length<=limit) return parts
    let end = parts[limit-1]
    while (end && doc.getTextWidth(end+'…')>max) end = end.slice(0,-1)
    return [...parts.slice(0,limit-1),end+'…']
  }
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    doc.setFillColor(color)
    doc.rect(x,y,w,h,'F')
  }
  const rule = (y: number) => { doc.setDrawColor(line);doc.setLineWidth(.5);doc.line(M,y,W-M,y) }
  const currentPage = () => doc.getNumberOfPages()
  const sections: { title: string; page: number; y: number }[] = []

  // Reserve page one so it can link to the paginated category sections.
  doc.addPage()
  let y = 0, alternating = false
  const columns = [M+8, M+218, W-M-84]
  function section(title: string, count: number, continued: boolean) {
    const name = continued ? `${title} (continued)` : title
    const lines = wrapped(name,width-95,12,'bold',3)
    const head = 16 + lines.length * 15
    fill(tint,M,y,width,head)
    fill('#387CB5',M,y,3,head)
    text(lines,M+10,y+17,12,'bold',blue)
    text(`${quantity(count)} blocks`,W-M-8,y+17,9,'regular',muted,'right')
    y+=head+17
    text('MINECRAFT',columns[0],y,8,'bold',muted)
    text('BLOXD.IO SUGGESTION',columns[1],y,8,'bold',muted)
    text('COLOR DISTANCE',columns[2],y,8,'bold',muted)
    y+=7;rule(y)
    alternating = false
  }
  function bodyStart() {
    text('BLOCK ATLAS',M,41,11,'bold',blue)
    text(bundled ? 'JAVA EDITION 26.3 REFERENCE' : 'CUSTOM CSV REFERENCE',W-M,41,8,'bold',muted,'right')
    rule(51)
    y=66
  }
  bodyStart()
  for (const [category, blocks] of groups) {
    if (y>bottom-141) {doc.addPage();bodyStart()}
    else if (y>66) y+=16
    sections.push({ title: category, page: currentPage(), y })
    section(category,blocks.length,false)
    for (const r of blocks) {
      const left = columns[1]-columns[0]-12, right = columns[2]-columns[1]-9
      const names = wrapped(r.name,left,10,'bold',4)
      font(7.5,'mono')
      const idSize = Math.max(7.2, Math.min(7.5, 7.5*(left-.6)/doc.getTextWidth(r.id)))
      const ids = wrapped(r.id,left,idSize,'mono',3)
      const matches = wrapped(matchName(r),right,10,'regular',4)
      const tiers = wrapped(r.verdict,right,8,'regular',3)
      const height = Math.max(30, names.length*12.5 + ids.length*idSize*1.25 + 8, matches.length*12.5 + tiers.length*10 + 8)
      if (y+height>bottom) {doc.addPage();bodyStart();section(category,blocks.length,true)}
      if (alternating) fill('#F6F8FA',M,y,width,height)
      text(names,columns[0],y+12,10,'bold')
      text(ids,columns[0],y+12+names.length*12.5,idSize,'mono',muted)
      text(matches,columns[1],y+12,10)
      text(tiers,columns[1],y+12+matches.length*12.5,8,'regular',muted)
      const distance = score(r.delta)
      text(distance || 'Not scored',columns[2],y+12,distance ? 10 : 8,distance ? 'bold' : 'regular',distance ? ink : muted)
      swatches(r,columns[2],y+17)
      y+=height;rule(y);alternating=!alternating
    }
  }
  function swatches(r: AtlasRow,x: number,y: number) {
    const c = [r.exposed,r.side,r.top].find(c => c.mc && c.bloxd)
    if (!c) return
    for (const [i,color] of [c.mc,c.bloxd].entries()) {
      doc.setFillColor(color);doc.setDrawColor('#9BA9B6');doc.setLineWidth(.4)
      doc.roundedRect(x+i*20,y,17,8,2,2,'FD')
    }
  }

  doc.setPage(1)
  fill('#142E47',M,38,width,166)
  fill('#61A3DE',M,38,4,166)
  text('FIELD REFERENCE  /  PRINT EDITION',M+21,65,9,'bold','#C5DEF4')
  text('Block Atlas',M+20,117,41,'bold','#FFFFFF')
  text('Minecraft to Bloxd.io',M+22,149,17,'regular','#E4F2FC')
  text(bundled ? 'JAVA EDITION 26.3  •  BUNDLED REFERENCE' : 'CUSTOM CSV  •  ACTIVE DATASET',M+22,181,8.5,'bold','#C5DEF4')
  // A simple block icon, drawn as vectors so it remains crisp in print.
  const px = W-M-77, py = 83, ps = 9
  for (const [col,row,color] of [[2,0,'#98C6EB'],[1,1,'#98C6EB'],[2,1,'#B0D6F3'],[3,1,'#98C6EB'],[0,2,'#75ACE1'],[1,2,'#82B7E5'],[2,2,'#92BFF0'],[3,2,'#5392C9'],[4,2,'#4B85B8'],[0,3,'#75ACE1'],[1,3,'#82B7E5'],[2,3,'#92BFF0'],[3,3,'#5392C9'],[4,3,'#4B85B8'],[1,4,'#75ACE1'],[2,4,'#82B7E5'],[3,4,'#5392C9'],[2,5,'#82B7E5']] as const) {
    fill(color,px+col*ps,py+row*ps,ps-.3,ps-.3)
  }
  const metrics = [[rows.length,'BLOCKS'],[scored,'COLOR-SCORED'],[rows.length-scored,'UNSCORED']] as const
  const box = width/3
  metrics.forEach(([value,label],i)=>{
    const x=M+i*box
    fill(tint,x,220,box-(i<2?4:0),53)
    text(quantity(value),x+12,246,21,'bold',blue)
    text(label,x+12,261,8,'bold',muted)
  })
  text('How to read the catalog',M,307,15,'bold')
  const guide = [
    'Search for the exact Minecraft ID or jump to a category below.',
    'Color distance uses CIEDE2000. Smaller values mean closer measured color, not equivalent behavior. “Not scored” means no color score was recorded.',
    'When shown, the left swatch is Minecraft and the right is Bloxd.io. Swatches use the exposed pair, then sides or top if needed.',
    'Suggestions are not recipes or gameplay guarantees. Use the CSV or plain text edition for full notes and original Unicode text.',
  ]
  let introY = 327
  guide.forEach(item=>{
    const lines=wrapped(item,width-14,10)
    text('•',M,introY,10,'bold',blue)
    text(lines,M+12,introY,10,'regular',muted)
    introY+=lines.length*12.5+8
  })
  text('Categories',M,introY+13,15,'bold')
  let indexPage = 1, indexY = introY+30
  const colWidth=(width-16)/2
  for (let i=0;i<sections.length;i+=2) {
    const pair=sections.slice(i,i+2), labels=pair.map(section=>wrapped(section.title,colWidth-48,10,'regular',3))
    const rowHeight=12+12.5*Math.max(...labels.map(lines=>lines.length))
    if (indexY+rowHeight>bottom) {
      doc.addPage();indexPage=currentPage();indexY=78
      text('Category index (continued)',M,51,17,'bold')
    }
    pair.forEach((section,j)=>{
      const x=M+j*(colWidth+16)
      fill(tint,x,indexY-5,colWidth,rowHeight-3)
      text(labels[j],x+8,indexY+10,10,'regular',blue)
      text(String(section.page),x+colWidth-8,indexY+10,9,'bold',muted,'right')
      doc.link(x,indexY-5,colWidth,rowHeight-3,{pageNumber:section.page,top:section.y})
    })
    indexY+=rowHeight
  }
  // PDF bookmark tree and stable page footers.
  doc.outline.add(null,'Category index',{pageNumber:1})
  for (const section of sections) doc.outline.add(null,printable(section.title),{pageNumber:section.page})
  const pages = doc.getNumberOfPages()
  for (let p=1;p<=pages;p++) {
    doc.setPage(p);rule(H-38)
    text(p===1 || indexPage>1 && p>=indexPage ? 'BLOCK ATLAS  /  CATEGORY INDEX' : 'BLOCK ATLAS  /  PRINT EDITION',M,H-23,8,'bold',muted)
    text(`${p} / ${pages}`,W-M,H-23,8,'regular',muted,'right')
  }
  return doc.output('arraybuffer')
}
