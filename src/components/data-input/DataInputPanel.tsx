import type { RefObject } from 'react';
import styles from './DataInputPanel.module.css';

interface Props {
  textValue: string;
  onTextChange: (text: string) => void;
  onClearData: () => void;
  awaitingPaste?: boolean;
  pasteAreaRef?: RefObject<HTMLTextAreaElement | null>;
  readOnly?: boolean;
}

export function DataInputPanel({
  textValue,
  onTextChange,
  onClearData,
  awaitingPaste = false,
  pasteAreaRef,
  readOnly = false,
}: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.sectionHeader}>
        <h3>从剪贴板导入数据</h3>
        <p className={styles.hint}>
          点击顶部按钮后，系统会优先读取系统剪贴板；如果当前浏览器拦截读取，页面会进入等待粘贴状态，这时直接按
          {' '}
          Ctrl+V
          {' '}
          就会自动导入解析。
        </p>
        {readOnly && <p className={styles.pasteNotice}>当前账号是只读模式，可查看数据，但不能修改比赛内容。</p>}
        {!readOnly && awaitingPaste && <p className={styles.pasteNotice}>已进入等待粘贴状态，请现在按 Ctrl+V。</p>}
      </div>

      <div className={styles.singleMethod}>
        <textarea
          ref={pasteAreaRef}
          className={`${styles.textarea} ${awaitingPaste ? styles.awaitingPaste : ''}`}
          value={textValue}
          readOnly={readOnly}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="如果浏览器不允许直接读取系统剪贴板，可以先把完整表格粘贴到这里。"
        />

        {!readOnly && (
          <div className={styles.actionRow}>
            <button className={styles.clearBtn} onClick={onClearData}>
              清空当前比赛数据
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
