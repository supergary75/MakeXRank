import styles from './CurriculumSystem.module.css';
import { MindsetProgression } from './MindsetProgression';
import { PersonalAbilityProgression } from './PersonalAbilityProgression';

export function PersonalCoreSystem() {
  return <section className={styles.detail} aria-label="个人核心能力培养方向">
    <h3>从自主学习，到工程担当</h3>
    <p>技术成长与个人成长并行；比赛心态管理是独立、明确的培养目标。</p>
    <section className={styles.progression} aria-labelledby="competition-mindset-title">
      <p className={styles.eyebrow}>重点能力 · 比赛心态管理</p>
      <h3 id="competition-mindset-title">情绪调节与抗挫成长</h3>
      <p><strong>不是要求孩子没有情绪，而是帮助孩子认识情绪、获得支持，并逐步回到任务。</strong></p>
      <div className={styles.modules}>
        <section><h4>赛前 · 面对紧张</h4><p>能表达担心什么，选择适合自己的准备方法，把注意力放在可控事项上。</p><p>观察例子：告诉教练自己紧张，与伙伴检查准备清单。</p></section>
        <section><h4>赛中 · 应对失误</h4><p>出现失误时尝试暂停调整、主动求助，并在支持下确认下一步行动。</p><p>观察例子：不急于责怪队友，先说明问题，再共同选择下一步。</p></section>
        <section><h4>赛后 · 从挫折中成长</h4><p>允许失落，待状态适合时复盘；区分可控与不可控因素，提出一次具体改进。</p><p>观察例子：说出感受，描述事实，约定下一次练习的小目标。</p></section>
      </div>
      <h4>教练如何记录进步？</h4>
      <p>记录“发生了什么 → 孩子采用什么方法 → 需要什么支持 → 如何重新参与 → 下一步练习”。没有观察机会时记为“尚未观察”。</p>
      <p className={styles.note}>不以输赢、是否哭泣、恢复速度或表面冷静给孩子排名；不强迫孩子立即恢复比赛或复盘。这是教学观察，不是心理诊断。</p>
    </section>
    <MindsetProgression />
    <PersonalAbilityProgression />
    <p className={styles.note}>八项能力均已提供七级课程目标，属于教研草案，不代表学生已有成绩或人格标签。</p>
  </section>;
}
