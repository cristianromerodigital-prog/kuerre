SIZE=25;U=14;M=16;SW=SIZE*U+M*2
K='M 10,10 L 90,10 L 90,110 L 290,10 L 290,90 L 165,150 L 290,210 L 290,290 L 90,190 L 90,290 L 10,290 Z'
def hc(r,c):
    v=((r*2654435761)^(c*2246822519))&0xFFFFFFFF
    v=(v^(v>>16))&0xFFFFFFFF;v=(v*0x45d9f3b)&0xFFFFFFFF;v=(v^(v>>16))&0xFFFFFFFF
    return v%100
rects=[]
for r in range(SIZE):
    for c in range(SIZE):
        if hc(r,c)<40:
            x=M+c*U+1;y=M+r*U+1;w=U-2
            rects.append(f'<rect x="{x}" y="{y}" width="{w}" height="{w}" fill="#111" rx="0.5"/>')
def finder(gr,gc):
    for dr in range(7):
        for dc in range(7):
            r=gr+dr;c=gc+dc;x=M+c*U+1;y=M+r*U+1;w=U-2
            outer=dr in(0,6)or dc in(0,6)
            center=2<=dr<=4 and 2<=dc<=4
            if outer or center:
                rects.append(f'<rect x="{x}" y="{y}" width="{w}" height="{w}" fill="#111" rx="0.5"/>')
            else:
                rects.append(f'<rect x="{x}" y="{y}" width="{w}" height="{w}" fill="white"/>')
finder(0,0);finder(0,18);finder(18,0)
defs=f'''<defs>
  <clipPath id="k"><path d="{K}"/></clipPath>
  <radialGradient id="bg" cx="50%" cy="50%" r="55%">
    <stop offset="0%"   stop-color="#d8d8d8"/>
    <stop offset="45%"  stop-color="#b0b0b0"/>
    <stop offset="100%" stop-color="#707070"/>
  </radialGradient>
  <filter id="sh" x="-15%" y="-15%" width="130%" height="130%">
    <feDropShadow dx="0" dy="6" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/>
  </filter>
</defs>'''
svg=f'<svg width="{SW}" height="{SW}" viewBox="0 0 {SW} {SW}" xmlns="http://www.w3.org/2000/svg">{defs}<rect width="{SW}" height="{SW}" fill="url(#bg)" rx="24"/><g filter="url(#sh)"><path d="{K}" fill="white"/><g clip-path="url(#k)">{"".join(rects)}</g><path d="{K}" fill="none" stroke="white" stroke-width="5"/></g></svg>'
open(r'e:\CLAUDE\Servital\Desarrollo\logo.svg','w').write(svg)
print('OK logo.svg',SW,'x',SW)
