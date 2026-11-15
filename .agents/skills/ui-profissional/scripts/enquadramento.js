// Enquadramento em HTML: mede texto contra campo, botão, pílula ou chip.
// Uso: cole no console, rode pelo javascript_tool do navegador ou passe ao page.evaluate do Playwright. Devolve a lista de problemas.
(() => {
  const P = { padMinPx: 12, padMinRel: 0.25, centroPx: 4, centroRel: 0.1, assimetriaPx: 8, umaLinhaRel: 3.8 };
  const visivel = (s) => s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  const temCaixa = (s) => {
    const fundo = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
    const borda = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none";
    return fundo || borda || s.backgroundImage !== "none";
  };
  const caixaDe = (el) => {
    for (let c = el; c && c !== document.body; c = c.parentElement) {
      const s = getComputedStyle(c), r = c.getBoundingClientRect();
      if (temCaixa(s) && r.width < innerWidth * 0.9 && r.height > 16) return { el: c, r };
    }
    return null;
  };
  const textos = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visivel(getComputedStyle(n.parentElement))) continue;
    const g = document.createRange(); g.selectNodeContents(n);
    const r = g.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) textos.push({ txt: n.textContent.trim().slice(0, 40), r, el: n.parentElement });
  }
  const saida = [], porCaixa = new Map();
  for (const t of textos) {
    const c = caixaDe(t.el);
    if (!c) continue;
    const e = t.r.left - c.r.left, d = c.r.right - t.r.right, cima = t.r.top - c.r.top, baixo = c.r.bottom - t.r.bottom;
    const f = (v) => Math.round(v);
    if (e < 0 || d < 0 || cima < 0 || baixo < 0) { saida.push(`vaza: "${t.txt}" (esq ${f(e)}, dir ${f(d)}, cima ${f(cima)}, baixo ${f(baixo)})`); continue; }
    if (c.r.height > P.umaLinhaRel * t.r.height) continue;
    const min = Math.max(P.padMinPx, P.padMinRel * c.r.height);
    if (Math.min(e, d) < min) saida.push(`colado: "${t.txt}" tem ${f(Math.min(e, d))} px até a borda (mínimo ${f(min)})`);
    if (Math.abs(cima - baixo) > Math.max(P.centroPx, P.centroRel * c.r.height)) saida.push(`fora do centro: "${t.txt}" (${f(cima)} em cima, ${f(baixo)} embaixo)`);
    const centrado = getComputedStyle(t.el).textAlign === "center" || getComputedStyle(c.el).justifyContent === "center";
    if (centrado && Math.abs(e - d) > P.assimetriaPx) saida.push(`fora do centro: "${t.txt}" (${f(e)} à esquerda, ${f(d)} à direita)`);
    if (!porCaixa.has(c.el)) porCaixa.set(c.el, []);
    porCaixa.get(c.el).push({ ...t, c });
  }
  for (const lista of porCaixa.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) => a.r.left - b.r.left);
    const a = lista[0], b = lista[lista.length - 1];
    if (a.r.right > b.r.left) continue;
    const pe = a.r.left - a.c.r.left, pd = b.c.r.right - b.r.right;
    if (Math.abs(pe - pd) > P.assimetriaPx) saida.push(`assimétrico: ${Math.round(pe)} px à esquerda de "${a.txt}" e ${Math.round(pd)} px à direita de "${b.txt}"`);
  }
  return saida;
})();
