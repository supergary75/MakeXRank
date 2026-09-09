import { useState } from 'react';
import styles from './CurriculumSystem.module.css';

export function FrcInspiration() {
  const [failed, setFailed] = useState(false);
  return <section className={styles.frcFeature} aria-label="FRC机器人实物参考">
    <figure>
      {!failed ? <img src="https://upload.wikimedia.org/wikipedia/commons/c/c5/FIRST_Championship_Detroit_2019_%E2%80%93_FRC_bot_1.jpg" alt="2019年底特律FIRST锦标赛上的FRC机器人" width="3000" height="4000" decoding="async" onError={() => setFailed(true)} /> : <p>图片暂时无法加载，请通过下方来源查看原图。</p>}
      <figcaption>2019 FIRST Championship Detroit · 机器人实物参考</figcaption>
    </figure>
    <div><p className={styles.eyebrow}>FROM LEARNING TO ENGINEERING</p><h3>把知识，变成真正的机器人</h3><p>从认识零件、编写程序，到设计、制造与团队协作。五个课程维度共同服务于一个目标：让队员能够解决真实的工程问题。</p><p>图为其他团队的FRC机器人，非本俱乐部作品，不代表官方合作或背书。</p><details><summary>图片来源与使用许可</summary><p>摄影：Stilfehler。<a href="https://commons.wikimedia.org/wiki/File:FIRST_Championship_Detroit_2019_%E2%80%93_FRC_bot_1.jpg" target="_blank" rel="noreferrer">查看原始作品</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>。原图未修改，仅按比例缩放展示。</p></details></div>
  </section>;
}
