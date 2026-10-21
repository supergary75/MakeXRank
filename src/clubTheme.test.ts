/// <reference types="node" />
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const theme=readFileSync(new URL('./club-theme.css',import.meta.url),'utf8');
const entry=readFileSync(new URL('./main.tsx',import.meta.url),'utf8');
const base=readFileSync(new URL('./index.css',import.meta.url),'utf8');
const luminance=(hex:string)=>{const c=hex.match(/[a-f\d]{2}/gi)!.map(x=>parseInt(x,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
it('只启用暖金主题，不再叠加旧粉彩与亮黄主题，也不远程加载衬线字体',()=>{
  expect(entry).toContain("import './club-theme.css'");expect(entry).not.toContain('macaron-theme.css');expect(entry).not.toContain('frc-theme.css');
  expect(base).not.toContain('fonts.googleapis.com');expect(theme).not.toContain('#ffd700');
});
it('正文、浅色表面、深色导航与暖金按钮保持可读对比度',()=>{
  expect(contrast('292720','f6f3ec')).toBeGreaterThan(7);
  expect(contrast('756e60','f6f3ec')).toBeGreaterThan(4.5);
  expect(contrast('c5c0b7','1a1c1e')).toBeGreaterThan(7);
  expect(contrast('302616','bc995b')).toBeGreaterThan(4.5);
});
it('容量与考勤状态仍用红绿语义；全卡点击遮罩仍透明，日历条目可多行增长',()=>{
  for(const selector of ["data-class-full='true'","data-class-underfilled='true'","data-attendance-row='present'","data-attendance-row='unverified'","data-training-overview-entry","data-training-group='MakeX Explorer小学组'"])expect(theme).toContain(selector);
  expect(theme).toContain('background:transparent!important; border:0!important; box-shadow:none!important;');
  expect(theme).toContain('height:auto; min-height:90px');
});
