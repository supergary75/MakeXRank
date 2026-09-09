import styles from './CurriculumSystem.module.css';

export function CurriculumCardVisual({ index }: { index: number }) {
  return <div className={styles.cardVisual} data-kind={index} aria-hidden="true">
    {index === 0 && <><svg viewBox="0 0 64 64"><path d="M20 10h24v15c0 10-6 16-12 16s-12-6-12-16V10Z M20 15H10v8c0 8 5 12 13 12 M44 15h10v8c0 8-5 12-13 12 M32 41v12 M21 55h22" /></svg><div className={styles.visualWords}>TASK → ALLIANCE<br /><b>BUILD · COMPETE</b></div></>}
    {index === 1 && <div className={styles.codePreview}><code><em>if</em> robot.is_ready():<br />{'    '}robot.move()<br />{'    '}<em>return</em> success</code><b>{'{ }'} GRAPHICAL → PYTHON → JAVA</b></div>}
    {index === 2 && <><svg viewBox="0 0 64 64"><path d="M40 9a14 14 0 0 0-16 18L9 42a7 7 0 0 0 10 10l15-15A14 14 0 0 0 52 21l-9 9-9-9 9-9Z" /><circle cx="15" cy="47" r="2" /><path d="m47 43 8 5v9l-8 5-8-5v-9Z" /><circle cx="47" cy="52" r="3" /></svg><div className={styles.visualWords}>ASSEMBLE · TEST<br /><b>零件 / 连接 / 传动</b></div></>}
    {index === 3 && <><svg viewBox="0 0 64 64"><path d="m32 6 24 14v26L32 60 8 46V20Z M8 20l24 14 24-14 M32 34v26 M8 46l24-14 24 14 M32 6v26" /></svg><div className={styles.visualWords}>SKETCH → MODEL<br /><b>2D → 3D → 制造</b></div></>}
    {index === 4 && <div className={styles.formulaPreview}><b>U = IR</b><b>v = s / t</b><div>测量 · 数量 · 运动 · 能量</div></div>}
  </div>;
}
