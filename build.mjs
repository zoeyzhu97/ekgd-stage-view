import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://ekgd-stage-system.zoeyzhu97.chatgpt.site';
function read(path) {
  return execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '30', origin + path], {encoding:'utf8'});
}
const page = read('/stage.html');
const stock = JSON.parse(read('/api/kline?secid=1.688610'));
const index = JSON.parse(read('/api/kline?secid=1.000688'));
const margin = JSON.parse(read('/api/margin')).map;
const source = page.match(/<script>([\s\S]+?)<\/script>/)?.[1];
const end = source?.lastIndexOf('\nrefresh();');
if (!source || end < 0 || !index.klines?.length || !Object.keys(margin || {}).length) {
  throw Error('Incomplete source or indicator data');
}
const date = row => row.split(',')[0];
const dates = stock.klines.map(date);
if (!dates.includes('2026-01-05') || dates.at(-1) !== date(index.klines.at(-1))) throw Error('Incomplete history');
const elements = {};
const document = {getElementById(id) {return elements[id] ??= {style:{},value:'',replaceChildren(){}};}};
const context = vm.createContext({document,Option:class {}, stock,index,margin});
vm.runInContext(source.slice(0,end) + `
K=parseKlines(stock.klines);
IDX=Object.fromEntries(parseKlines(index.klines).map(d=>[d.date,d.close]));
MARGIN=margin;
PRIMARY_DATA_SOURCE=stock.source;
LATEST=analyzeDay(K.length-1);
render();`, context, {timeout:10000});
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const content = id => escape(elements[id].textContent);
const months = [...new Set(dates.filter(d=>d>='2026-01-01').map(d=>d.slice(0,7)))].reverse();
const history = elements.histBody.innerHTML;
if ((history.match(/<tr>/g)||[]).length !== dates.filter(d=>d>='2026-01-01').length) throw Error('Incomplete rendered history');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>埃科光电 · 阶段判断公开查询</title>
<style>${page.match(/<style>([\s\S]+?)<\/style>/)[1]}
body{padding:0 12px}.container{margin:auto}.card{overflow:hidden}h1{font-size:clamp(22px,4vw,32px)}label,select,p{font-size:15px}select{padding:5px}.scroll{overflow:auto;max-height:65vh}thead{position:sticky;top:0;background:#faf7f2}.quote{font-size:26px;font-weight:700}.summary{display:flex;align-items:center;gap:15px;flex-wrap:wrap}.summary strong{white-space:nowrap}</style>
<main class="container"><h1>埃科光电 · 阶段判断公开查询</h1><p>688610.SH · 收盘数据 · ${content('dataStatus')}</p>
<section class="card"><h3>阶段判断</h3><div class="summary"><strong class="quote">${content('price')} 元</strong><strong>${content('chg')}</strong><strong>${content('phaseBadge')}</strong></div><p>买入评分 <b>${content('buyVal')}</b> / 100　风险评分 <b>${content('riskVal')}</b> / 100</p></section>
<section class="card"><h3>买入评分明细</h3>${elements.buyFactors.innerHTML}</section>
<section class="card"><h3>证伪条件</h3>${elements.falsList.innerHTML}</section>
<section class="card"><h3>阻力阶梯</h3>${elements.ladderList.innerHTML}</section>
<section class="card"><h3>历史记录</h3><label>查询月份 <select id="month"><option value="">全部月份</option>${months.map(m=>`<option>${escape(m)}</option>`).join('')}</select></label> <span id="range" role="status">${content('historyRange')}</span>
<p>收盘价采用前复权口径。7 月 1 日及以前仅评估顶部风险。</p><div class="scroll"><table><thead><tr><th>日期</th><th>收盘</th><th>涨跌%</th><th>成交额</th><th>买入分</th><th>风险分</th><th>阶段</th></tr></thead><tbody>${history}</tbody></table></div></section>
<p>交易日收盘后更新。持仓同步和微信推送请使用<a href="${origin}">原站</a>。</p></main>
<script>const month=document.querySelector('#month'),rows=[...document.querySelectorAll('tbody tr')];month.onchange=()=>{const dates=[];for(const row of rows){const date=row.cells[0].textContent;row.hidden=!date.startsWith(month.value);if(!row.hidden)dates.push(date)}document.querySelector('#range').textContent=dates.at(-1)+' 至 '+dates[0]+' · '+dates.length+' 个交易日'};</script></html>`;
writeFileSync('docs/index.html',html);
console.log(dates.at(-1),months.length,'months');
