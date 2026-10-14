import type { ReactNode } from 'react';
import './TeamPhotoBanner.css';

const photos = {
  home: { file: 'houston-team.jpg', alt: '队员在 FIRST Championship 场馆前合影', caption: '走向更大的赛场 · 一起成长' },
  competition: { file: 'reefscape-team.jpg', alt: '队员与机器人在 REEFSCAPE 赛场合影', caption: '从共同备赛，到并肩上场' },
  interview: { file: 'team-outdoors.jpg', alt: '队员户外活动合影', caption: '认识彼此 · 发现每个人的可能' },
  product: { file: 'chips-exchange.jpg', alt: '队员在 CHIPS 324 工作室交流合影', caption: '在交流中学习 · 在实践中创造' },
  academic: { file: 'miami-team.jpg', alt: '队员在 Miami Valley Regional 赛场合影', caption: '每一次同行，都留下成长的记录' },
} as const;

export type TeamBannerKind = keyof typeof photos;

export default function TeamPhotoBanner({ kind, title, eyebrow, description, action }: {
  kind: TeamBannerKind; title: string; eyebrow?: string; description: string; action?: ReactNode;
}) {
  const photo = photos[kind];
  return <section data-team-banner={kind} aria-label={`${title}主视觉`}>
    {action && <div className="team-banner-actions">{action}</div>}
    <div className="team-banner-layout">
      <div className="team-banner-copy">
        <p className="team-banner-eyebrow">{eyebrow}</p>
        <h1>{kind === 'home' ? <>俱乐部内部<br />工作系统</> : title}</h1>
        <span className="team-banner-rule" aria-hidden="true" />
        <p className="team-banner-description">{description}</p>
        <p className="team-banner-motto">BUILD · THINK · SOLVE TOGETHER</p>
      </div>
      <figure className="team-banner-photo">
        <div className="team-banner-image"><img src={`${import.meta.env.BASE_URL}images/team/${photo.file}`} alt={photo.alt} fetchPriority="high" /></div>
        <figcaption>{photo.caption}</figcaption>
      </figure>
    </div>
  </section>;
}
