import {useEffect, useRef, useState} from 'react';
import {canPromptPwaInstall, getPwaInstallEnvironment, getPwaInstallGuide, getPwaLaunchUrl, INSTALL_READY_EVENT, isPwaInstalled, requestPwaInstall} from '../pwaInstall';
import type {InstallDevice} from '../pwaInstall';
import {WORKSPACE_NAME} from '../workspaceBrand';
import css from './PwaInstallControl.module.css';

export default function PwaInstallControl({className}:{className?:string}) {
  const [available, setAvailable] = useState(canPromptPwaInstall);
  const [installed, setInstalled] = useState(isPwaInstalled);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [device, setDevice] = useState<InstallDevice>(()=>getPwaInstallEnvironment().device);
  const dialog = useRef<HTMLDialogElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const guide = getPwaInstallGuide(device);
  const url = getPwaLaunchUrl();

  useEffect(()=>{
    const sync=()=>{setAvailable(canPromptPwaInstall());setInstalled(isPwaInstalled());};
    sync();
    window.addEventListener(INSTALL_READY_EVENT,sync);
    return ()=>window.removeEventListener(INSTALL_READY_EVENT,sync);
  },[]);
  useEffect(()=>{
    if(open && !dialog.current?.open) dialog.current?.showModal();
  },[open]);

  const install=async()=>{
    setBusy(true);setMessage('');setCopyMessage('');
    try {
      const result=await requestPwaInstall();
      if(result==='manual') setOpen(true);
      else if(result==='dismissed') {setMessage('本次未安装。你可以按下面步骤手动添加，或等待浏览器再次提供安装提示。');setOpen(true);}
      else if(result==='accepted') setMessage(`已确认安装，请按系统提示完成，并在桌面或应用列表中查找“${WORKSPACE_NAME}”。`);
      else setMessage('此设备已安装工作台，可从桌面或应用列表打开。');
    } catch {
      setMessage('未能打开系统安装提示，请按下面步骤手动添加。');setOpen(true);
    } finally {
      setBusy(false);setAvailable(canPromptPwaInstall());setInstalled(isPwaInstalled());
    }
  };
  const copy=async()=>{
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage('入口链接已复制，请粘贴到 Safari、Chrome 或 Edge。');
    } catch {
      urlInput.current?.focus();urlInput.current?.select();
      setCopyMessage('浏览器不允许自动复制，已选中链接，请长按复制或按 Ctrl+C。');
    }
  };

  return <>
    <button type="button" className={className} disabled={busy||installed} onClick={()=>void install()} aria-haspopup={available?undefined:'dialog'}>
      {installed?'已安装到此设备':busy?'正在打开安装提示…':available?'安装到此设备':'添加到桌面（查看步骤）'}
    </button>
    {!open&&message&&<p className={css.feedback} role="status">{message}</p>}
    {open&&<dialog ref={dialog} className={css.dialog} aria-labelledby="pwa-install-title" onClose={()=>setOpen(false)}>
      <header className={css.heading}><div><p>DESKTOP SHORTCUT</p><h2 id="pwa-install-title">把工作台放到桌面</h2></div><button type="button" aria-label="关闭添加说明" onClick={()=>dialog.current?.close()}>×</button></header>
      {getPwaInstallEnvironment().wechat&&<p className={css.notice}>检测到微信内打开：请先从右上角“…”切换到浏览器。这里不能直接替你创建桌面图标。</p>}
      {message&&<p className={css.notice} role="status">{message}</p>}
      <div className={css.devices} role="group" aria-label="选择需要添加的设备">
        {([['ios','苹果手机 / iPad'],['android','安卓手机'],['desktop','电脑']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={device===value} onClick={()=>setDevice(value)}>{label}</button>)}
      </div>
      <h3>{guide.title}</h3><p>{guide.description}</p>
      <ol>{guide.steps.map(step=><li key={step}>{step}</li>)}</ol>
      <label className={css.link}>正式工作台入口<input ref={urlInput} value={url} readOnly onFocus={event=>event.currentTarget.select()}/></label>
      <button type="button" className={css.copy} onClick={()=>void copy()}>复制工作台入口链接</button>
      {copyMessage&&<p role="status">{copyMessage}</p>}
      <p className={css.note}>只有系统或浏览器确认后，桌面才会出现图标。添加图标不等于登录；首次从图标打开，可能仍需使用本人账号登录。</p>
      <button type="button" className={css.close} onClick={()=>dialog.current?.close()}>完成，返回工作台</button>
    </dialog>}
  </>;
}
